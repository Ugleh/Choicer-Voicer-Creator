const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');const {MediaEngine}=require('../electron/media.cjs');
test('MP4 and MKV -> preview, waveforms, backing and verified playable pack',async()=>{
  const dir=path.resolve('.test-data','integration-'+Date.now());await fs.mkdir(dir,{recursive:true});const engine=new MediaEngine(path.join(dir,'cache'),()=>({}));await engine.check();
  const source=path.join(dir,'source.mp4');
  await engine.ff(['-f','lavfi','-i','testsrc2=size=640x360:rate=24:duration=8','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=8','-map','0:v','-map','1:a','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',source]);
  const mkv=path.join(dir,'source.mkv');await engine.ff(['-i',source,'-c','copy',mkv]);
  let media;
  for(const file of [source,mkv]){media=await engine.prepare(file);assert.equal(media.width,640);assert.ok(media.peaks.some(p=>p>0));assert.equal(media.thumbs.length,10);assert.ok((await fs.stat(media.preview)).size>1000);}
  const scene={linePadding:0,id:'scene',name:'Nuts',start:2,end:6,clips:[{id:'a',caption:'He said "go"',character:'Vendor',start:.42,end:1.8},{id:'b',caption:'A second line',character:'Customer',start:2,end:3.6}],normalize:true};
  const backing=path.join(dir,'backing.wav');await engine.sceneAudio(media,scene,backing);scene.backing={path:backing,duration:4,sourceStart:2,sourceEnd:6,audioIndex:media.audioIndex,reviewed:true};
  const project={name:'Test collection',author:'Test author',media,scenes:[scene]};const output=await engine.exportScene(project,scene,dir);
  assert.ok(output.files.includes('dub_video.ogv'));assert.ok(output.files.includes('_backing_track.wav'));assert.ok(output.files.includes('_pack_info.ini'));
  const audio=output.files.filter(f=>/^\d.*\.wav$/.test(f));assert.equal(audio.length,2);for(const file of audio){const info=await engine.probe(path.join(output.path,file));assert.equal(info.raw.streams[0].codec_name,'pcm_s16le');assert.ok(Math.abs(info.duration-(file.startsWith('01')?1.38:1.6))<.03);}
  assert.match(await fs.readFile(path.join(output.path,output.files.find(f=>f.startsWith('01')&&f.endsWith('.ini'))),'utf8'),/dub_timestamps=\[0\.420\]/);
  const video=await engine.probe(path.join(output.path,'dub_video.ogv'));assert.equal(video.raw.streams[0].codec_name,'theora');assert.ok(Math.abs(video.duration-4)<.15);
  await assert.rejects(engine.exportScene(project,scene,dir),/already exists/);
  const chorus={...scene,id:'chorus',name:'Simultaneous voices',clips:Array.from({length:4},(_,i)=>({id:String(i),caption:'Hey!',character:`Character ${i+1}`,start:.42,end:1.42}))};
  const simultaneous=await engine.exportScene(project,chorus,dir);
  const chorusInis=simultaneous.files.filter(f=>/^\d.*\.ini$/.test(f));assert.equal(chorusInis.length,4);
  for(const file of chorusInis){assert.match(await fs.readFile(path.join(simultaneous.path,file),'utf8'),/dub_timestamps=\[0\.420\]/);const info=await engine.probe(path.join(simultaneous.path,file.replace(/\.ini$/,'.wav')));assert.ok(Math.abs(info.duration-1)<.01);}
  await fs.writeFile(path.resolve('.test-data','fixture-path.json'),JSON.stringify({dir,source,mkv,backing}));
  console.log('Integration fixture:',dir);
});
