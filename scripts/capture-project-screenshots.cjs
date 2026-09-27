// Capture a saved project in an isolated editor session. No API key or upload is needed.
const {_electron:electron}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');

(async()=>{
  if(!process.argv[2])throw new Error('Usage: node scripts/capture-project-screenshots.cjs <project.cvcreator> [output-directory]');
  const file=path.resolve(process.argv[2]),before=await fs.readFile(file),project=JSON.parse(before);
  if(!project.media?.preview||!project.scenes?.some(s=>s.clips?.length))throw new Error('Open the project in the editor first and save at least one scene with dialogue. A cached preview is required.');
  const output=path.resolve(process.argv[3]||'docs/screenshots');await fs.mkdir(output,{recursive:true});
  const root=path.resolve('.test-data');await fs.mkdir(root,{recursive:true});
  const data=await fs.mkdtemp(path.join(root,'screenshots-'));
  const stat=await fs.stat(project.media.path),hash=crypto.createHash('sha256').update(`${project.media.path}:${stat.size}:${stat.mtimeMs}:${project.media.audioIndex}:v2`).digest('hex').slice(0,24);
  const cache=path.join(data,'cache',hash);await fs.mkdir(cache,{recursive:true});
  // These completed preview files are only read by the editor. Hard links avoid
  // copying/reconverting a movie; cross-volume caches fall back to ordinary copies.
  async function reuse(source,destination){try{await fs.link(source,destination);}catch(e){if(e.code!=='EXDEV'&&e.code!=='EPERM')throw e;await fs.copyFile(source,destination);}}
  await reuse(project.media.preview,path.join(cache,'preview.mp4'));
  await fs.writeFile(path.join(cache,'peaks.json'),JSON.stringify(project.media.peaks));
  for(const [index,thumb] of (project.media.thumbs||[]).entries())await reuse(thumb,path.join(cache,`thumb-${index}.jpg`));
  const workingProject=path.join(data,'screenshot-project.cvcreator');await fs.writeFile(workingProject,before);
  await fs.writeFile(path.join(data,'settings.json'),JSON.stringify({ffmpegPath:process.env.CV_FFMPEG_PATH||'',ffprobePath:process.env.CV_FFPROBE_PATH||''}));
  const launch=process.env.CV_PACKAGED_EXE?{executablePath:path.resolve(process.env.CV_PACKAGED_EXE),args:[]}:{args:[path.resolve('.')]};
  const app=await electron.launch({...launch,env:{...process.env,CV_TEST_DATA:data}});
  try{
    const page=await app.firstWindow();page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await app.evaluate(({BrowserWindow,dialog},projectFile)=>{BrowserWindow.getAllWindows()[0].setContentSize(1600,1400);dialog.showOpenDialog=async()=>({canceled:false,filePaths:[projectFile]});},workingProject);
    await page.getByText('FFmpeg ready',{exact:false}).waitFor();
    await page.getByRole('button',{name:'Open',exact:true}).click();await page.locator('.scene-item').first().waitFor();
    const sceneIndex=project.scenes.reduce((best,scene,index)=>scene.clips.length>project.scenes[best].clips.length?index:best,0);
    await page.locator('.scene-item').nth(sceneIndex).click();await page.locator('.line-row').first().waitFor();
    await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
    async function ready(){
      await page.waitForFunction(()=>!document.querySelector('video')?.seeking);
      await page.waitForFunction(()=>{const pictures=[...document.querySelectorAll('.filmstrip img')];return pictures.length>0&&pictures.every(p=>p.complete&&p.naturalWidth>0);});
      await page.locator('main').evaluate(el=>el.scrollTo({top:0,left:0,behavior:'instant'}));
      await page.mouse.move(1590,15);
    }
    await page.locator('.line-row').nth(Math.min(2,await page.locator('.line-row').count()-1)).click();
    await ready();await page.screenshot({path:path.join(output,'scene-editor.png')});
    await page.locator('.line-row').nth(Math.min(3,await page.locator('.line-row').count()-1)).dblclick();
    await ready();await page.screenshot({path:path.join(output,'dialogue-timing.png')});
    await page.getByRole('button',{name:'GameBanana',exact:true}).click();await page.getByLabel('GameBanana description preview').waitFor();
    await page.getByRole('dialog').evaluate(el=>el.scrollTo(0,0));await page.mouse.move(1590,15);
    await page.screenshot({path:path.join(output,'share-collection.png')});
    assert.deepEqual(errors,[]);assert.deepEqual(await fs.readFile(file),before,'The original project must stay unchanged.');
    console.log(`Saved three screenshots to ${output}. Original project unchanged; no cloud requests or personal settings loaded.`);
  }finally{await app.evaluate(({app})=>app.exit(0));await app.close().catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1;});
