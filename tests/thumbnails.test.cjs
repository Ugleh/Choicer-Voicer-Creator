const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {TimelineThumbnails}=require('../electron/thumbnails.cjs');
test('visible-range pictures use exact preview times, cache completed frames and cancel stale decoding',async()=>{
  const fixture=JSON.parse(await fs.readFile('.test-data/fixture-path.json','utf8')),dir=path.resolve('.test-data','pictures-'+Date.now());
  const service=new TimelineThumbnails(dir,()=>({})),media={preview:fixture.source,duration:8,fps:24};
  let calls=0;const ff=service.engine.ff.bind(service.engine);service.engine.ff=(...args)=>{calls++;return ff(...args);};
  const frames=await service.request(media,2,6,8);assert.equal(frames.length,8);
  assert.ok(frames.every(f=>f.time>=2&&f.time<6));assert.equal(new Set(frames.map(f=>f.path)).size,8);
  const bytes=await Promise.all(frames.map(f=>fs.readFile(f.path)));assert.ok(new Set(bytes.map(b=>b.toString('base64'))).size>4);
  assert.deepEqual(await service.request(media,2,6,8),frames);assert.equal(calls,8);
  const earlier=service.request(media,0,2,12),later=service.request(media,6,8,6);
  assert.equal(await earlier,null);assert.ok((await later).every(f=>f.time>=6));
  const original=service.engine.ff.bind(service.engine);service.engine.ff=async(...args)=>{service.cancel();return original(...args);};
  assert.equal(await service.request(media,0,1,4),null);
  const files=await fs.readdir(dir,{recursive:true});assert.ok(files.every(f=>!f.endsWith('.partial.jpg')));
  assert.throws(()=>service.request(media,-1,2,6),/Invalid/);assert.throws(()=>service.request(media,0,9,6),/Invalid/);assert.throws(()=>service.request(media,0,2,1000),/Invalid/);
});
