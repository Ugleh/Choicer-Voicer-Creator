const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {MediaEngine}=require('../electron/media.cjs');
const {validateScene}=require('../electron/core.cjs');

function wave(){
  const count=4*48000,buffer=Buffer.alloc(44+count*2);
  buffer.write('RIFF');buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(48000,24);buffer.writeUInt32LE(96000,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(count*2,40);
  for(let i=0;i<count;i++)buffer.writeInt16LE((i%30001)-15000,44+i*2);
  return buffer;
}
function samples(buffer){for(let i=12;i<buffer.length;){const size=buffer.readUInt32LE(i+4);if(buffer.toString('ascii',i,i+4)==='data')return buffer.subarray(i+8,i+8+size);i+=8+size+(size%2);}throw Error('No WAV samples');}

test('scene trimming preserves exact backing/vocal samples and exports aligned dialogue',async()=>{
  const dir=path.resolve('.test-data','trim-audio-'+Date.now());await fs.mkdir(dir,{recursive:true});
  const fixture=JSON.parse(await fs.readFile('.test-data/fixture-path.json','utf8'));
  const engine=new MediaEngine(path.join(dir,'cache'),()=>({})),original=wave();
  const backing=path.join(dir,'backing.wav'),vocals=path.join(dir,'vocals.wav');await fs.writeFile(backing,original);await fs.writeFile(vocals,original);
  const media={path:fixture.mkv,duration:8.021,audioIndex:1,videoIndex:0};
  const scene={linePadding:0,id:'s',name:'Trim test',start:2,end:6,normalize:false,clips:[{id:'a',caption:'Keep me',character:'A',start:1.2,end:2.2}],backing:{path:backing,vocalsPath:vocals,duration:4,sourceStart:2,sourceEnd:6,audioIndex:1,reviewed:true,provider:'Test'}};
  const snapshot=structuredClone(scene),result=await engine.trimScene(media,scene,3,5);
  assert.deepEqual(scene,snapshot);assert.equal(result.backing.reviewed,true);assert.equal(result.start,3);assert.equal(result.end,5);assert.deepEqual(result.clips,[{...scene.clips[0],start:.2,end:1.2}]);
  const expected=samples(original).subarray(48000*2,3*48000*2);
  for(const file of [result.backing.path,result.backing.vocalsPath]){assert.deepEqual(samples(await fs.readFile(file)),expected);assert.equal((await engine.probe(file)).duration,2);}
  for(const file of [backing,vocals])assert.deepEqual(await fs.readFile(file),original);
  assert.deepEqual(validateScene(result,media).errors,[]);
  const exported=await engine.exportScene({name:'Trim collection',author:'Test',media},result,dir);
  assert.match(await fs.readFile(path.join(exported.path,'01_Keepme.ini'),'utf8'),/dub_timestamps=\[0\.200\]/);
  const dialogue=samples(await fs.readFile(path.join(exported.path,'01_Keepme.wav')));
  assert.deepEqual(dialogue,expected.subarray(.2*48000*2,1.2*48000*2));
  assert.ok(Math.abs((await engine.probe(path.join(exported.path,'dub_video.ogv'))).duration-2)<.15);
  const twice=await engine.trimScene(media,result,3.25,4.75);assert.equal(twice.backing.duration,1.5);assert.deepEqual(samples(await fs.readFile(twice.backing.path)),expected.subarray(.25*48000*2,1.75*48000*2));
  await assert.rejects(engine.trimScene(media,{...scene,backing:{...scene.backing,sourceStart:0}},3,5),/does not match/);
  const originalFF=engine.ff.bind(engine);engine.ff=async(args,options)=>{if(options.label.includes('vocals'))throw Error('Simulated stem failure');return originalFF(args,options);};
  await assert.rejects(engine.trimScene(media,scene,3,5),/Simulated/);assert.deepEqual(scene,snapshot);assert.deepEqual(await fs.readFile(backing),original);
  engine.ff=originalFF;engine.cancel();await assert.rejects(engine.trimScene(media,scene,3,5),/cancelled/);assert.deepEqual(scene,snapshot);
  console.log('Trim audio verified: exact samples, both stems, repeated trim, dialogue export, original preservation, failure/cancellation.');
});
