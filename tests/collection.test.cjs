const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {MediaEngine}=require('../electron/media.cjs');
const {collectionPlan}=require('../electron/collection.cjs');
const {packIni,packName,collectionTitle,validateProject}=require('../electron/core.cjs');
function pcm(buffer){for(let i=12;i<buffer.length;){const size=buffer.readUInt32LE(i+4);if(buffer.toString('ascii',i,i+4)==='data')return buffer.subarray(i+8,i+8+size);i+=8+size+(size%2);}throw Error('Missing samples');}

test('pack title overrides the source name, preserves INI text and falls back for old projects',()=>{
 const project={version:1,name:'source-file',packTitle:'Kung Pow: "Best Bits"',author:'Me',scenes:[]};
 assert.equal(collectionTitle(project),'Kung Pow: "Best Bits"');assert.equal(packName(project,{name:'Intro'}),'Kung Pow Best Bits - Intro');
 assert.ok(packIni(project,{name:'Intro'}).includes('title="Kung Pow: \\"Best Bits\\" - Intro"'));
 assert.equal(collectionTitle({...project,packTitle:' '}),'source-file');assert.equal(collectionTitle({name:'old project'}),'old project');
 assert.throws(()=>validateProject({...project,packTitle:2}),/pack title/);
});

test('combined collection retains scene order, aligns video/backing and offsets dialogue; individual export stays separate',async()=>{
 const dir=path.resolve('.test-data','collection-'+Date.now());await fs.mkdir(dir,{recursive:true});
 const engine=new MediaEngine(path.join(dir,'cache'),()=>({})),source=path.join(dir,'red-blue.mkv');
 await engine.ff(['-f','lavfi','-i','color=c=red:size=160x90:rate=24:duration=3','-f','lavfi','-i','color=c=blue:size=160x90:rate=24:duration=3','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=6','-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0[v]','-map','[v]','-map','2:a:0','-c:v','libx264','-pix_fmt','yuv420p','-c:a','pcm_s16le',source]);
 const media={path:source,duration:6,fps:24,videoIndex:0,audioIndex:1};
 const a={linePadding:0,id:'a',name:'Blue first',start:4,end:5.019,normalize:false,clips:[{id:'line-a',start:.1,end:.4,caption:'Together!',character:'A'},{id:'line-b',start:.1,end:.4,caption:'Together!',character:'B'}]};
 const b={linePadding:0,id:'b',name:'Red second',start:.5,end:2.507,normalize:true,clips:[{id:'line-c',start:.2,end:1.9,caption:'Later in the pack',character:'C'}]};
 for(const [i,scene] of [a,b].entries()){const file=path.join(dir,`backing-${i}.wav`),duration=scene.end-scene.start;await engine.ff(['-f','lavfi','-i',`aevalsrc=${i?-.1:.2}:s=48000:d=${duration}`,'-ac','2','-c:a','pcm_s16le',file]);scene.backing={path:file,duration,sourceStart:scene.start,sourceEnd:scene.end,audioIndex:1,reviewed:true};}
 const excluded={...a,id:'excluded',name:'Skip this scene',excludeFromCollection:true,clips:[]};
 const project={version:1,name:'Source collection name',packTitle:'Custom Combined Title',author:'Author',description:'Collection description',media,scenes:[a,excluded,b]},before=structuredClone(project),plan=collectionPlan(project);
 assert.deepEqual(plan.entries.map(e=>e.scene.id),['a','b']);assert.equal(plan.entries[1].offset,25/24);assert.equal(plan.lines[2].timedClip.start,1.242);
 const root=path.join(dir,'packs');await fs.mkdir(root);const result=await engine.exportCollection(project,root);
 assert.deepEqual(await fs.readdir(root),['Custom Combined Title']);assert.equal(result.sceneCount,2);assert.equal(result.lineCount,3);
 assert.equal(result.files.filter(f=>f.endsWith('.ogv')).length,1);assert.equal(result.files.filter(f=>/^\d.*\.wav$/.test(f)).length,3);assert.ok(!result.files.includes('_work'));
 assert.match(await fs.readFile(path.join(result.path,'_pack_info.ini'),'utf8'),/title="Custom Combined Title"/);assert.match(await fs.readFile(path.join(result.path,'03_Laterinthepack.ini'),'utf8'),/dub_timestamps=\[1\.242\]/);
 for(const file of ['01_Together!.ini','02_Together!.ini'])assert.match(await fs.readFile(path.join(result.path,file),'utf8'),/dub_timestamps=\[0\.100\]/);
 const joined=pcm(await fs.readFile(path.join(result.path,'_backing_track.wav'))),first=pcm(await fs.readFile(a.backing.path)),second=pcm(await fs.readFile(b.backing.path));
 assert.equal(joined.length,plan.samples*4);assert.deepEqual(joined.subarray(0,first.length),first);assert.ok(joined.subarray(first.length,plan.entries[0].sampleCount*4).every(v=>v===0));assert.deepEqual(joined.subarray(plan.entries[0].sampleCount*4,plan.entries[0].sampleCount*4+second.length),second);
 const ogv=path.join(result.path,'dub_video.ogv');
 // Theora can omit duplicate pictures for static colors; verify its timeline
 // duration and reconstruct held frames before inspecting the cut boundary.
 const counted=JSON.parse(await engine.run('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=duration_ts,time_base','-of','json',ogv]));assert.equal(counted.streams[0].time_base,'1/24');assert.equal(+counted.streams[0].duration_ts,plan.frames);
 const bytes=[];await engine.run('ffmpeg',['-v','error','-i',ogv,'-vf',"fps=24,select='eq(n,24)+eq(n,25)',scale=1:1",'-fps_mode','passthrough','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{onData:b=>bytes.push(b)});const colors=Buffer.concat(bytes);assert.equal(colors.length,6);assert.ok(colors[2]>200&&colors[0]<30,'last frame of first scene must be blue');assert.ok(colors[3]>200&&colors[5]<30,'first frame of second scene must be red');
 const individual=await engine.exportScene(project,b,root);assert.match(await fs.readFile(path.join(individual.path,'01_Laterinthepack.ini'),'utf8'),/dub_timestamps=\[0\.200\]/);assert.match(await fs.readFile(path.join(individual.path,'_pack_info.ini'),'utf8'),/title="Custom Combined Title - Red second"/);
 await assert.rejects(engine.exportCollection(project,root),/already exists/);assert.deepEqual(project,before);
 const failedRoot=path.join(dir,'failed');await fs.mkdir(failedRoot);const ff=engine.ff.bind(engine);engine.ff=async(args,opts)=>{if(opts?.label==='Encoding combined collection video'){engine.cancel();throw Error('Operation cancelled.');}return ff(args,opts);};
 await assert.rejects(engine.exportCollection(project,failedRoot),/cancelled/);assert.deepEqual(await fs.readdir(failedRoot),[]);assert.deepEqual(project,before);
 console.log('Collection export verified: order, exact frame transition, backing samples/padding, rebased duplicate timestamps, custom title, individual export, overwrite refusal and cancellation cleanup.');
});

test('collection exclusions reject an empty selection and match shared statistics',()=>{
 const {collectionStats}=require('../shared/sharing.mjs');
 const scene={id:'a',name:'Included',start:0,end:2,clips:[{id:'line',start:0,end:1,caption:'Two words',character:'A'}]};
 const project={version:1,name:'Exclusions',media:{path:'source.mkv',duration:5,audioIndex:1,fps:24},scenes:[scene,{...scene,id:'b',name:'Excluded',excludeFromCollection:true}]};
 assert.deepEqual(collectionPlan(project).entries.map(e=>e.scene.id),['a']);
 const stats=collectionStats(project);assert.equal(stats.scenes.length,1);assert.equal(stats.words,2);assert.equal(stats.duration,2);
 assert.equal(validateProject(project),project);
 assert.throws(()=>collectionPlan({...project,scenes:project.scenes.map(s=>({...s,excludeFromCollection:true}))}),/Enable at least one scene/);
 assert.throws(()=>validateProject({...project,scenes:[{...scene,excludeFromCollection:'false'}]}),/collection export setting/);
});
