const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const AdmZip=require('adm-zip');const {ElevenLabs}=require('../electron/providers.cjs');
const scene={name:'AI fixture',start:10,end:12},media={audioIndex:1};
async function setup(t,fetchImpl,settings=()=>({transcribeRate:.01,separateRate:.1})){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cv-provider-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const jobs=[];const provider=new ElevenLabs({workspace:dir,getKey:()=> 'test-only-key',settings,record:async job=>jobs.push({...job}),progress:()=>{},engine:{sceneAudio:async(m,s,out)=>{await fs.writeFile(out,'fixture');return out;},normalizeAudio:async(input,out,duration)=>{await fs.copyFile(input,out);return {duration};}},fetchImpl});return {provider,jobs};}
test('transcription sends only a scene with diarization and records request status',async t=>{
  const {provider,jobs}=await setup(t,async(url,opts)=>{assert.match(url,/speech-to-text$/);assert.equal(opts.body.get('model_id'),'scribe_v2');assert.equal(opts.body.get('diarize'),'true');assert.equal(await opts.body.get('file').text(),'fixture');return new Response(JSON.stringify({words:[{type:'word',text:'Hi!',start:.4,end:.9,speaker_id:'speaker_0'}]}),{headers:{'request-id':'req-test'}});});
  const result=await provider.run('transcribe',media,scene);assert.equal(result.clips[0].start,.4);assert.equal(jobs.at(-1).status,'succeeded');assert.equal(jobs.at(-1).actualUsd,null);assert.equal(jobs.at(-1).requestId,'req-test');
});
test('separation keeps named instrumental and vocals stems without trusting ZIP paths',async t=>{
  const zip=new AdmZip();zip.addFile('folder/instrumental.mp3',Buffer.from('music'));zip.addFile('folder/vocals.mp3',Buffer.from('voice'));
  const {provider,jobs}=await setup(t,async(url,opts)=>{assert.match(url,/music\/stem-separation/);assert.equal(opts.body.get('stem_variation_id'),'two_stems_v1');return new Response(zip.toBuffer());});
  const result=await provider.run('separate',media,scene);assert.equal(await fs.readFile(result.path,'utf8'),'music');assert.equal(await fs.readFile(result.vocalsPath,'utf8'),'voice');assert.equal(result.reviewed,false);assert.equal(result.sourceStart,10);assert.equal(jobs.at(-1).status,'succeeded');
});
test('network uncertainty is recorded without automatically retrying a paid job',async t=>{let calls=0;const {provider,jobs}=await setup(t,async()=>{calls++;throw new Error('Network gone');});await assert.rejects(provider.run('transcribe',media,scene),/Network gone/);assert.equal(calls,1);assert.equal(jobs.at(-1).status,'unconfirmed');});
test('unknown separation stem naming fails instead of exporting the vocal stem',async t=>{const zip=new AdmZip();zip.addFile('vocals.mp3',Buffer.from('voice'));const {provider}=await setup(t,async()=>new Response(zip.toBuffer()));await assert.rejects(provider.run('separate',media,scene),/No stem was guessed/);});

test('submitted job retains the selected rate even if settings change during upload',async t=>{
  let settings={subscriptionTier:'creator',pricingMode:'plan'};
  const {provider,jobs}=await setup(t,async()=>{settings={subscriptionTier:'creator',pricingMode:'custom',transcribeRate:.1,separateRate:.2};return new Response(JSON.stringify({words:[{type:'word',text:'Hello',start:0,end:1}]}));},()=>settings);
  await provider.run('transcribe',media,{...scene,end:130});
  assert.equal(jobs.at(-1).estimatedUsd,2*.22/60);assert.equal(jobs.at(-1).pricingBasis,'published Scribe v2 rate');assert.equal(jobs.at(-1).pricingTier,'creator');assert.equal(jobs.at(-1).actualUsd,null);
});
