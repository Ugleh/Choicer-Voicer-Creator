const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {lineRange}=require('../shared/line-range.mjs'),{MediaEngine}=require('../electron/media.cjs'),{validateScene,validateProject,clipName}=require('../electron/core.cjs'),{collectionPlan}=require('../electron/collection.cjs');
function pcm(buffer){for(let i=12;i<buffer.length;){const size=buffer.readUInt32LE(i+4);if(buffer.toString('ascii',i,i+4)==='data')return buffer.subarray(i+8,i+8+size);i+=8+size+(size%2);}throw Error('Missing WAV samples');}
test('padding defaults to half a second, clamps at scene edges, and counts toward the hard length limit',()=>{
  const scene={name:'Scene',start:20,end:100,clips:[{id:'a',start:2,end:3,caption:'Words',character:'A'}]},clip=scene.clips[0];
  assert.deepEqual(lineRange(scene,clip),{...clip,start:1.5,end:3.5});assert.deepEqual(lineRange({...scene,linePadding:0},clip),clip);
  assert.equal(lineRange(scene,{start:.1,end:79.8}).start,0);assert.equal(lineRange(scene,{start:.1,end:79.8}).end,80);
  assert.deepEqual(validateScene(scene,{duration:100,audioIndex:1}).errors,[]);
  assert.match(validateScene({...scene,clips:[{...clip,start:1,end:60.5}]},{duration:100,audioIndex:1}).errors.join(),/including padding/);
  assert.match(validateScene({...scene,backingMissing:true},{duration:100,audioIndex:1}).errors.join(),/saved backing/);
  assert.throws(()=>validateProject({version:1,name:'Test',scenes:[{...scene,id:'a',linePadding:-1}]}),/padding/);
});
test('real exports include surrounding audio, preserve sync, and support absent or mixed backing tracks',async()=>{
  const dir=path.resolve('.test-data','padding-'+Date.now());await fs.mkdir(dir,{recursive:true});const engine=new MediaEngine(path.join(dir,'cache'),()=>({})),source=path.join(dir,'source.mkv');
  await engine.ff(['-f','lavfi','-i','testsrc2=size=160x90:rate=24:duration=8','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=8','-c:v','libx264','-preset','ultrafast','-c:a','pcm_s16le','-shortest',source]);
  const media={path:source,duration:8,fps:24,videoIndex:0,audioIndex:1},scene={id:'a',name:'No backing',start:1,end:5,normalize:false,clips:[{id:'first',start:.1,end:.8,caption:'First',character:'A'},{id:'middle',start:1.5,end:2.5,caption:'Middle',character:'B'},{id:'last',start:3.8,end:4,caption:'Last',character:'A'}]};
  const project={version:1,name:'Padding',author:'Test',media,scenes:[scene]},before=structuredClone(project),single=await engine.exportScene(project,scene,dir);
  assert.equal((await engine.probe(path.join(single.path,'_backing_track.wav'))).duration,4);assert.ok(pcm(await fs.readFile(path.join(single.path,'_backing_track.wav'))).every(v=>v===0));
  for(const [i,clip] of scene.clips.entries()){
    const range=lineRange(scene,clip),duration=range.end-range.start,name=clipName(clip,i),actual=path.join(single.path,name+'.wav'),reference=path.join(dir,`${i}-reference.wav`);
    assert.ok(Math.abs((await engine.probe(actual)).duration-duration)<1/48000);assert.match(await fs.readFile(path.join(single.path,name+'.ini'),'utf8'),new RegExp(`dub_timestamps=\\[${range.start.toFixed(3).replace('.','\\.')}\\]`));
    await engine.ff(['-ss',String(scene.start+range.start),'-i',source,'-map','0:1','-vn','-af',`atrim=duration=${duration},aresample=48000,asetpts=N/SR/TB,atrim=end_sample=${Math.round(duration*48000)}`,'-ac','1','-c:a','pcm_s16le',reference]);
    const written=pcm(await fs.readFile(actual)),expected=pcm(await fs.readFile(reference));
    // Matroska's millisecond timestamps can leave a fractional millisecond at
    // the cut. All decoded samples must survive; only that tiny tail is padded.
    assert.deepEqual(written.subarray(0,expected.length),expected);assert.ok(written.length-expected.length<=96);assert.ok(written.subarray(expected.length).every(v=>v===0));
  }
  const vocals=path.join(dir,'vocals.wav');await engine.sceneAudio(media,scene,vocals);const vocalScene={...scene,backing:{vocalsPath:vocals}};
  assert.equal((await engine.writeDialogue(media,vocalScene,scene.clips[1],path.join(dir,'padded-vocals.wav'))).duration,2);
  const second={id:'b',name:'With backing',start:5,end:7,normalize:false,clips:[{id:'other',start:.75,end:1.5,caption:'Second scene',character:'C'}]},track=path.join(dir,'backing.wav');
  await engine.ff(['-f','lavfi','-i','aevalsrc=0.1:s=48000:d=2','-ac','2','-c:a','pcm_s16le',track]);second.backing={path:track,duration:2,sourceStart:5,sourceEnd:7,audioIndex:1,reviewed:true};
  const combinedProject={...project,scenes:[scene,second]},plan=collectionPlan(combinedProject),result=await engine.exportCollection(combinedProject,dir),samples=pcm(await fs.readFile(path.join(result.path,'_backing_track.wav')));
  assert.ok(samples.subarray(0,4*48000*4).every(v=>v===0));assert.deepEqual(samples.subarray(4*48000*4),pcm(await fs.readFile(track)));assert.equal(plan.lines.at(-1).timedClip.start,4.25);
  assert.match(await fs.readFile(path.join(result.path,'04_Secondscene.ini'),'utf8'),/dub_timestamps=\[4\.250\]/);assert.equal((await engine.probe(path.join(result.path,'04_Secondscene.wav'))).duration,1.75);
  assert.deepEqual(project,before);
});
