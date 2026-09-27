const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const AdmZip=require('adm-zip');
const {MediaEngine}=require('../electron/media.cjs');
const {ElevenLabs}=require('../electron/providers.cjs');
const {importEffect,mixBacking}=require('../electron/sound-effects.cjs');
const {effectError,trimEffects,validateSeparationRange}=require('../shared/sound-effects.mjs');
const {estimateUsage}=require('../shared/pricing.mjs');
const {validateScene}=require('../electron/core.cjs');
const rate=48000;
async function fixture(){
  await fs.mkdir('.test-data',{recursive:true});const dir=await fs.mkdtemp(path.resolve('.test-data','audio-editing-'));
  const engine=new MediaEngine(path.join(dir,'cache'),()=>({}));
  async function wav(name,values){const raw=path.join(dir,name+'.raw'),out=path.join(dir,name+'.wav'),pcm=Buffer.alloc(values.length*rate*4);for(let n=0;n<values.length*rate;n++){pcm.writeInt16LE(values[Math.floor(n/rate)],n*4);pcm.writeInt16LE(values[Math.floor(n/rate)],n*4+2);}await fs.writeFile(raw,pcm);await engine.ff(['-f','s16le','-ar',String(rate),'-ac','2','-i',raw,'-c:a','pcm_s16le',out]);return out;}
  async function pcm(file){const buffers=[];await engine.run('ffmpeg',['-v','error','-i',file,'-map','0:a:0','-ar',String(rate),'-ac','2','-f','s16le','pipe:1'],{onData:b=>buffers.push(b)});return Buffer.concat(buffers);}
  return {dir,engine,wav,pcm};
}
test('range separation crops either input and preserves every sample outside the selection and existing vocals',async()=>{
  const {dir,engine,wav,pcm}=await fixture(),original=await wav('original',[3000,3000,3000,3000,3000,3000,3000,3000]),backing=await wav('backing',[6000,6000,6000,6000]),replacement=await wav('new',[1000]),vocals=await wav('vocals',[2000,2000,2000,2000]);
  const scene={id:'s',name:'Repair',start:2,end:6,clips:[],backing:{path:backing,vocalsPath:vocals,duration:4,sourceStart:2,sourceEnd:6,audioIndex:0,reviewed:true}},media={path:original,audioIndex:0};
  const before=await fs.readFile(backing),base=await pcm(backing),calls=[],jobs=[];
  const extract=engine.sceneAudio.bind(engine);engine.sceneAudio=async(m,s,out)=>{calls.push({path:m.path,start:s.start,end:s.end});return extract(m,s,out);};
  for(const range of [{start:1,end:2,source:'backing'},{start:1,end:2,source:'original'},{start:0,end:1,source:'backing'},{start:3,end:4,source:'original'}]){
    const {source,start,end}=range;
    const zip=new AdmZip();zip.addFile('instrumental.wav',await fs.readFile(replacement));zip.addFile('vocals.wav',await fs.readFile(replacement));
    const provider=new ElevenLabs({engine,workspace:dir,getKey:()=> 'fake-test-key',settings:()=>({pricingMode:'plan'}),record:async j=>jobs.push({...j}),progress:()=>{},fetchImpl:async(url,options)=>{const upload=path.join(dir,'uploaded.wav');await fs.writeFile(upload,Buffer.from(await options.body.get('file').arrayBuffer()));assert.equal((await engine.probe(upload)).duration,1);return new Response(zip.toBuffer());}});
    const result=await provider.run('separate',media,scene,{range}),audio=await pcm(result.path);
    assert.equal(audio.length,base.length);assert.deepEqual(audio.subarray(0,start*rate*4),base.subarray(0,start*rate*4));assert.deepEqual(audio.subarray(end*rate*4),base.subarray(end*rate*4));assert.ok(Math.abs(audio.readInt16LE(Math.round((start+.5)*rate)*4)-1000)<=1);
    assert.equal(result.vocalsPath,vocals);assert.equal(result.reviewed,false);assert.equal(jobs.at(-1).seconds,1);assert.equal(jobs.at(-1).range.source,source);assert.equal(jobs.at(-1).status,'succeeded');
  }
  assert.deepEqual(calls,[{path:backing,start:1,end:2},{path:original,start:3,end:4},{path:backing,start:0,end:1},{path:original,start:5,end:6}]);assert.deepEqual(await fs.readFile(backing),before);
  assert.throws(()=>validateSeparationRange(scene,{start:-1,end:2,source:'backing'}));
  assert.throws(()=>validateSeparationRange(scene,{start:0,end:5,source:'original'}));
});
test('effects mix at sample-accurate offsets with gain, fades, overlap and mute; scene trims rebase source offsets',async()=>{
  const {dir,engine,wav,pcm}=await fixture(),input=await wav('effect',[2000,4000,6000]),asset=await importEffect(engine,input,path.join(dir,'asset'));
  const first={...asset,start:1,end:2.5,offset:.5,gain:.5,fadeIn:0,fadeOut:0},second={...first,id:'other',start:1.5,end:2.5,offset:0,gain:1};
  const scene={start:0,end:4,effects:[first,second]},output=path.join(dir,'mix.wav');await mixBacking(engine,scene,output);const audio=await pcm(output),at=t=>audio.readInt16LE(Math.round(t*rate)*4);
  assert.equal(audio.length,4*rate*4);assert.equal(at(.5),0);assert.ok(Math.abs(at(1.2)-1000)<=2);assert.ok(Math.abs(at(1.8)-4000)<=2);assert.equal(at(2.8),0);
  const muted=path.join(dir,'muted.wav');await mixBacking(engine,{...scene,effects:[{...first,muted:true}]},muted);assert.ok((await pcm(muted)).every(b=>b===0));
  const faded=path.join(dir,'faded.wav');await mixBacking(engine,{...scene,effects:[{...first,fadeIn:.2,fadeOut:.2}]},faded);const fadedPcm=await pcm(faded);assert.ok(Math.abs(fadedPcm.readInt16LE(Math.round(1.01*rate)*4))<100);assert.ok(Math.abs(fadedPcm.readInt16LE(Math.round(2.49*rate)*4))<150);
  const trimmed=trimEffects([first,second],1.25,1);assert.equal(trimmed[0].start,0);assert.equal(trimmed[0].offset,.75);assert.equal(trimmed[0].end,1);assert.equal(trimmed[1].start,.25);
  assert.equal(trimEffects([first],3,1).length,0);assert.ok(effectError({...first,end:9},4));
  assert.ok(validateScene({name:'s',...scene,clips:[],effects:[{...first,missing:true}]},{duration:4}).errors.some(e=>e.includes('missing')));
});
test('sound-effect mixing falls back for FFmpeg builds without filter_complex_script',async()=>{
  const {dir,engine,wav,pcm}=await fixture(),input=await wav('legacy-effect',[2000]),asset=await importEffect(engine,input,path.join(dir,'legacy-asset'));
  const calls=[],run=engine.ff.bind(engine);engine.ff=async(args,options)=>{calls.push(args);if(args.includes('-filter_complex_script'))throw Error("Unrecognized option 'filter_complex_script'.\nError splitting the argument list: Option not found");return run(args,options);};
  const output=path.join(dir,'legacy-mix.wav');await mixBacking(engine,{start:0,end:2,effects:[{...asset,start:0,end:1}]},output);
  assert.equal(calls.length,2);assert.ok(calls[1].includes('-filter_complex'));assert.equal((await pcm(output)).length,2*rate*4);
});
test('sound generation sends only a prompt and explicit duration and records cost without an automatic retry',async()=>{
  const {dir,engine,wav}=await fixture(),audio=await wav('generated',[2000,2000]),jobs=[];let requests=0;
  const settings=()=>({subscriptionTier:'creator',pricingMode:'plan'});
  const provider=new ElevenLabs({engine,workspace:dir,getKey:()=> 'fake-test-key',settings,record:async j=>jobs.push({...j}),progress:()=>{},fetchImpl:async(url,options)=>{requests++;assert.match(url,/sound-generation\?output_format=mp3_44100_128$/);const body=JSON.parse(options.body);assert.deepEqual(body,{text:'A door closes',duration_seconds:2,model_id:'eleven_text_to_sound_v2',prompt_influence:.3,loop:false});return new Response(await fs.readFile(audio),{headers:{'request-id':'sound-test','character-cost':'80'}});}});
  const result=await provider.run('sound-effect',{}, {name:'Effects',start:0,end:4},{text:'A door closes',duration:2});assert.equal(result.duration,2);assert.equal(result.provider,'ElevenLabs');assert.equal(requests,1);assert.equal(jobs.at(-1).requestId,'sound-test');assert.equal(jobs.at(-1).credits,'80');assert.equal(jobs.at(-1).estimatedUsd,.004);assert.equal(jobs.at(-1).actualUsd,null);
  await assert.rejects(provider.run('sound-effect',{}, {name:'s',start:0,end:4},{text:'',duration:2}));assert.equal(requests,1);
  provider.fetchImpl=async()=>{requests++;throw Error('Connection lost');};await assert.rejects(provider.run('sound-effect',{}, {name:'s',start:0,end:4},{text:'Rain',duration:2}),/Connection lost/);assert.equal(requests,2);assert.equal(jobs.at(-1).status,'unconfirmed');
  assert.equal(estimateUsage({subscriptionTier:'creator',pricingMode:'custom',soundEffectRate:.3},'sound-effect',2).estimatedUsd,.01);
});
test('four sound choices have independent requests, costs and files; failure/cancellation preserve completed choices',async()=>{
  const {dir,engine,wav}=await fixture(),audio=await wav('choices',[1000]),jobs=[];let calls=0;
  const provider=new ElevenLabs({engine,workspace:dir,getKey:()=> 'fake-key',settings:()=>({subscriptionTier:'creator',pricingMode:'plan'}),record:async j=>jobs.push({...j}),progress:()=>{},fetchImpl:async()=>{calls++;return new Response(await fs.readFile(audio),{headers:{'request-id':'choice-'+calls}});}});
  const scene={name:'Choices',start:0,end:4},options={text:'A click',duration:1};
  const result=await provider.generateChoices({},scene,options);assert.equal(calls,4);assert.equal(result.effects.length,4);assert.equal(new Set(result.effects.map(e=>e.path)).size,4);assert.deepEqual(result.effects.map(e=>e.variation),[1,2,3,4]);
  const completed=jobs.filter(j=>j.status==='succeeded');assert.equal(completed.length,4);assert.equal(new Set(completed.map(j=>j.batchId)).size,1);assert.equal(completed.reduce((sum,j)=>sum+j.estimatedUsd,0),.008);
  let partialCalls=0;provider.fetchImpl=async()=>{partialCalls++;if(partialCalls===3)throw Error('Connection lost');return new Response(await fs.readFile(audio));};
  const partial=await provider.generateChoices({},scene,options);assert.equal(partialCalls,3);assert.equal(partial.effects.length,2);assert.match(partial.error,/Connection lost/);
  let cancelCalls=0;provider.fetchImpl=async()=>{cancelCalls++;return new Response(await fs.readFile(audio));};
  const record=provider.record;provider.record=async job=>{await record(job);if(job.status==='succeeded')engine.cancelled=true;};
  const cancelled=await provider.generateChoices({},scene,options);assert.equal(cancelCalls,1);assert.equal(cancelled.effects.length,1);assert.match(cancelled.error,/cancelled/);
});

test('single and combined pack exports include effects at the correct scene offsets without adding them to dialogue',async()=>{
  const {dir,engine,wav,pcm}=await fixture(),movie=path.join(dir,'source.mp4');
  await engine.ff(['-f','lavfi','-i','color=c=blue:size=160x90:rate=24:duration=6','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t','6','-c:v','libx264','-c:a','aac',movie]);
  const info=await engine.probe(movie),media={...info,path:movie,audioIndex:1};
  const effect=await importEffect(engine,await wav('effect',[3000,3000]),path.join(dir,'effect-asset'));
  const first={id:'s1',name:'First',start:0,end:3,linePadding:0,normalize:false,clips:[{id:'a',start:1,end:2,caption:'A',character:'A'}],effects:[{...effect,start:1,end:2,offset:0,gain:.5}]};
  const second={...first,id:'s2',name:'Second',start:3,end:5,effects:[{...effect,id:'e2',start:.5,end:1.5,offset:0,gain:.3}]};
  const project={version:1,name:'Effects export',author:'Test',media,scenes:[first,second]};
  const single=await engine.exportScene(project,first,dir),singlePcm=await pcm(path.join(single.path,'_backing_track.wav'));
  assert.ok(Math.abs(singlePcm.readInt16LE(Math.round(1.5*rate)*4)-1500)<=2);assert.equal(singlePcm.readInt16LE(Math.round(.5*rate)*4),0);
  assert.ok((await pcm(path.join(single.path,'01_A.wav'))).every(b=>b===0),'Effects must not leak into dialogue samples');
  const combined=await engine.exportCollection(project,dir),combinedPcm=await pcm(path.join(combined.path,'_backing_track.wav'));
  assert.equal(combinedPcm.length,5*rate*4);assert.ok(Math.abs(combinedPcm.readInt16LE(Math.round(1.5*rate)*4)-1500)<=2);assert.ok(Math.abs(combinedPcm.readInt16LE(4*rate*4)-900)<=2);assert.equal(combinedPcm.readInt16LE(Math.round(3.2*rate)*4),0);
});
