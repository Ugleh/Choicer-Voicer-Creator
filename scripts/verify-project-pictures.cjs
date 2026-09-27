const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {TimelineThumbnails}=require('../electron/thumbnails.cjs');
(async()=>{
 const file=process.argv[2],before=await fs.readFile(file),project=JSON.parse(before),scene=project.scenes[0];
 const cache=path.resolve('.test-data','project-pictures-'+Date.now()),service=new TimelineThumbnails(cache,()=>({ffmpegPath:'C:\\ffmpeg\\bin\\ffmpeg.exe',ffprobePath:'C:\\ffmpeg\\bin\\ffprobe.exe'}));
 const started=Date.now(),frames=await service.request(project.media,scene.start,scene.end,12);
 assert.equal(frames.length,12);assert.ok(frames.every(f=>f.time>=scene.start&&f.time<scene.end));
 const images=await Promise.all(frames.map(f=>fs.readFile(f.path)));const unique=new Set(images.map(b=>b.toString('base64'))).size;assert.ok(unique>1);
 assert.deepEqual(await fs.readFile(file),before);
 console.log(JSON.stringify({scene:scene.name,pictures:frames.length,distinctPictures:unique,seconds:(Date.now()-started)/1000,cache}));
})().catch(e=>{console.error(e);process.exitCode=1;});
