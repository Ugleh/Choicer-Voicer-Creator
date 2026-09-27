const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path');
const {MediaEngine}=require('../electron/media.cjs');
function samples(buffer){for(let i=12;i<buffer.length;){const size=buffer.readUInt32LE(i+4);if(buffer.toString('ascii',i,i+4)==='data')return buffer.subarray(i+8,i+8+size);i+=8+size+(size%2);}throw Error('Missing WAV samples');}

test('normalized dialogue retains every sample when loudnorm timestamps jump',async()=>{
  const dir=path.resolve('.test-data','dialogue-audio-'+Date.now());await fs.mkdir(dir,{recursive:true});
  const engine=new MediaEngine(path.join(dir,'cache'),()=>({})),source=path.join(dir,'source.wav');
  await engine.ff(['-f','lavfi','-i','aevalsrc=0.2*sin(2*PI*440*t)*(0.3+0.7*abs(sin(2*PI*t))):s=48000:d=9','-ac','2','-c:a','pcm_s16le',source]);
  const media={path:source,audioIndex:0},scene={linePadding:0,name:'Normalization regression',start:.5,end:8.5,backing:{vocalsPath:source},normalize:true};
  for(const duration of [3.02,4.26,4.82,6.561]){
    const clip={start:.321,end:.321+duration,caption:'Keep the complete line',character:'Narrator'},output=path.join(dir,`${duration}.wav`),reference=path.join(dir,`${duration}-reference.wav`);
    const info=await engine.writeDialogue(media,scene,clip,output,3,13);assert.ok(Math.abs(info.duration-duration)<1/48000);
    // No final trim on the reference: all normalized samples reach the WAV.
    await engine.ff(['-ss',String(clip.start),'-i',source,'-map','0:a:0','-vn','-ac','1','-ar','48000','-c:a','pcm_s16le','-af',`atrim=duration=${duration},asetpts=PTS-STARTPTS,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000`,reference]);
    const expected=samples(await fs.readFile(reference)),actual=samples(await fs.readFile(output));assert.equal(expected.length,Math.round(duration*48000)*2);assert.deepEqual(actual,expected);
  }
  const clip={start:.2,end:1.2,caption:'Original source route',character:'Narrator'},output=path.join(dir,'source-route.wav');
  await engine.writeDialogue(media,{...scene,backing:null,normalize:false},clip,output);
  assert.deepEqual(samples(await fs.readFile(output)),samples(await fs.readFile(source)).subarray(Math.round(.7*48000)*4,Math.round(1.7*48000)*4).filter((_,i)=>i%4<2));
  const originalProbe=engine.probe.bind(engine);engine.probe=async file=>({...await originalProbe(file),duration:.8});
  await assert.rejects(engine.writeDialogue(media,scene,clip,path.join(dir,'invalid.wav'),3,13),error=>error.message.includes('line 3')&&error.message.includes(scene.name)&&error.message.includes('Expected 1.000s')&&error.message.includes('got 0.800s'));
});
