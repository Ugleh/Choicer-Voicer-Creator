const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {MediaEngine}=require('../electron/media.cjs'),{collectionPlan}=require('../electron/collection.cjs'),{clipName,clipIni}=require('../electron/core.cjs');
(async()=>{
 const file=path.resolve(process.argv[2]),root=path.resolve(process.argv[3]),before=await fs.readFile(file),project=JSON.parse(before),plan=collectionPlan(project);
 let settings={};try{const value=JSON.parse(await fs.readFile(path.join(process.env.APPDATA,'choicer-voicer-creator','settings.json'),'utf8'));settings={ffmpegPath:value.ffmpegPath,ffprobePath:value.ffprobePath};}catch{}
 let last='';const engine=new MediaEngine(path.resolve('.test-data','combined-cache'),()=>settings,p=>{const text=p.label+(Number.isFinite(p.percent)?` ${Math.floor(p.percent/25)*25}%`:'');if(text!==last){console.log(text);last=text;}});
 await fs.mkdir(root,{recursive:true});const result=await engine.exportCollection(project,root);
 for(let i=0;i<plan.lines.length;i++){const line=plan.lines[i],name=clipName(line.timedClip,i),audio=await engine.probe(path.join(result.path,name+'.wav'));assert.ok(Math.abs(audio.duration-(line.timedClip.end-line.timedClip.start))<1/48000);assert.equal(await fs.readFile(path.join(result.path,name+'.ini'),'utf8'),clipIni(line.timedClip));}
 const video=await engine.probe(path.join(result.path,'dub_video.ogv')),backing=await engine.probe(path.join(result.path,'_backing_track.wav'));assert.ok(Math.abs(video.duration-plan.duration)<.05);assert.ok(Math.abs(backing.duration-plan.samples/48000)<.001);assert.deepEqual(await fs.readFile(file),before);
 const report={path:result.path,title:plan.title,lines:plan.lines.length,videoDuration:video.duration,backingDuration:backing.duration,scenes:plan.entries.map(e=>({name:e.scene.name,offset:e.offset,duration:e.outputDuration}))};await fs.writeFile('.test-data/last-combined-export.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
