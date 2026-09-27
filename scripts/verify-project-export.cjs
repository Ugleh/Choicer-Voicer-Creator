const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {MediaEngine}=require('../electron/media.cjs');
const {lineRange}=require('../shared/line-range.mjs');
const {clipName,clipIni}=require('../electron/core.cjs');
(async()=>{
  const projectFile=path.resolve(process.argv[2]),root=path.resolve(process.argv[3]);
  const original=await fs.readFile(projectFile),project=JSON.parse(original);
  let settings={};try{const saved=JSON.parse(await fs.readFile(path.join(process.env.APPDATA,'choicer-voicer-creator','settings.json'),'utf8'));settings={ffmpegPath:saved.ffmpegPath,ffprobePath:saved.ffprobePath};}catch{}
  let last='';const engine=new MediaEngine(path.resolve('.test-data','export-check-cache'),()=>settings,p=>{const phase=p.label+(Number.isFinite(p.percent)?` ${Math.floor(p.percent/25)*25}%`:'');if(phase!==last){console.log(phase);last=phase;}});
  await fs.mkdir(root,{recursive:true});const report=[];
  // Check all dialogue first to catch the reported late failure without waiting
  // for video encoding. These diagnostic WAVs stay outside the deliverable packs.
  const audioCheck=path.resolve('.test-data','project-dialogue-'+Date.now());await fs.mkdir(audioCheck,{recursive:true});
  for(const scene of project.scenes){const clips=[...scene.clips].sort((a,b)=>a.start-b.start);for(let i=0;i<clips.length;i++)await engine.writeDialogue(project.media,scene,clips[i],path.join(audioCheck,scene.id+'-'+i+'.wav'),i+1,clips.length);console.log(`${scene.name}: all ${clips.length} dialogue files verified.`);}
  for(const scene of project.scenes){
    const result=await engine.exportScene(project,scene,root),clips=[...scene.clips].sort((a,b)=>a.start-b.start);
    for(let i=0;i<clips.length;i++){const name=clipName(clips[i],i),info=await engine.probe(path.join(result.path,name+'.wav'));assert.ok(Math.abs(info.duration-(lineRange(scene,clips[i]).end-lineRange(scene,clips[i]).start))<1/48000);assert.equal(await fs.readFile(path.join(result.path,name+'.ini'),'utf8'),clipIni(lineRange(scene,clips[i])));}
    const backing=await engine.probe(path.join(result.path,'_backing_track.wav')),video=await engine.probe(path.join(result.path,'dub_video.ogv'));assert.ok(Math.abs(backing.duration-(scene.end-scene.start))<.001);assert.ok(Math.abs(video.duration-(scene.end-scene.start))<.25);
    report.push({scene:scene.name,path:result.path,lines:clips.length,videoDuration:video.duration,backingDuration:backing.duration,warnings:result.warnings});console.log(`Verified pack: ${scene.name}`);
  }
  assert.deepEqual(await fs.readFile(projectFile),original,'Project changed during export verification');
  await fs.writeFile(path.resolve('.test-data','last-project-export.json'),JSON.stringify({projectFile,root,report},null,2));console.log(JSON.stringify({root,report},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
