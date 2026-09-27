const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
  const fixture=JSON.parse(await fs.readFile('.test-data/fixture-path.json','utf8'));
  const data=await fs.mkdtemp(path.resolve('.test-data','editor-qol-')),file=path.join(data,'original.cvcreator'),copy=path.join(data,'copy.cvcreator');
  const scene={id:'first',name:'First scene',start:2,end:6,clips:Array.from({length:16},(_,i)=>({id:'line'+i,start:.1+i*.2,end:.25+i*.2,caption:'Line '+i,character:'A'})),normalize:false};
  await fs.writeFile(file,JSON.stringify({version:1,name:'Editor QOL',media:{path:fixture.mkv,duration:8.021,audioIndex:1},scenes:[scene,{...scene,id:'second',name:'Second scene'}]}));
  const launch=process.env.CV_PACKAGED_EXE?{executablePath:path.resolve(process.env.CV_PACKAGED_EXE),args:[]}:{args:[path.resolve('.')]};
  const app=await electron.launch({...launch,env:{...process.env,CV_TEST_DATA:data}});
  try{
    const page=await app.firstWindow();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));const button=name=>page.getByRole('button',{name,exact:true});
    await page.getByText('FFmpeg ready',{exact:false}).waitFor();
    await app.evaluate(({dialog},{file,copy})=>{global.saves=[];dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});dialog.showSaveDialog=async options=>{global.saves.push(options);return {canceled:false,filePath:copy};};dialog.showMessageBox=async()=>({response:1});},{file,copy});
    await button('Open').click();await page.locator('.line-row').first().waitFor();await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
    const checkSize=async()=>{
      const box=await page.locator('.preview-panel').boundingBox(),video=await page.locator('.video-wrap').boundingBox(),info=await page.locator('.preview-info .mono').boundingBox(),toggle=await page.getByRole('checkbox',{name:'Show lines',exact:true}).boundingBox();
      assert.ok(Math.abs(box.width-2-video.width)<2,'video fills preview width');assert.ok(toggle.y>info.y+info.height,'Show lines below resolution');
    };
    await page.setViewportSize({width:1500,height:1000});await checkSize();
    assert.equal(await page.locator('.effects-track').count(),0);assert.ok((await page.locator('.sound-effects-panel').boundingBox()).height<85);
    await page.screenshot({path:'.test-data/editor-qol.png'});
    await button('Pin preview').click();await page.locator('main').evaluate(e=>e.scrollTop=e.scrollHeight);await page.waitForTimeout(200);
    const pinned=await page.locator('.preview-panel').boundingBox(),main=await page.locator('main').boundingBox();
    assert.ok(pinned.y>=main.y-1&&pinned.y<main.y+30,`pinned preview stays at scroll top: ${JSON.stringify({pinned,main})}`);
    await page.screenshot({path:'.test-data/editor-qol-pinned.png'});
    await button('Play').click();await page.waitForFunction(()=>!document.querySelector('video').paused);await button('Pause').click();
    await page.locator('.line-row').first().evaluate(e=>e.click());
    const scrollBefore=await page.locator('main').evaluate(e=>e.scrollTop);await button('Play line').evaluate(e=>e.click());
    assert.equal(await page.locator('main').evaluate(e=>e.scrollTop),scrollBefore,'Play line keeps the editing scroll position while pinned');
    await button('Pause').click();
    await button('Unpin preview').click();
    const second=page.locator('.scene-item').filter({hasText:'Second scene'});await second.click({button:'right'});
    await page.getByRole('menuitemcheckbox').click();assert.equal(await page.locator('.export-excluded').count(),1);
    assert.equal(await page.locator('h1').textContent(),'First scene');
    await button('Save As…').click();await page.getByText('Collection saved.',{exact:false}).waitFor();
    let saved=JSON.parse(await fs.readFile(copy,'utf8'));assert.equal(saved.scenes[1].excludeFromCollection,true);assert.equal(JSON.parse(await fs.readFile(file,'utf8')).scenes[1].excludeFromCollection,undefined);
    await page.locator('.scene-item').first().click({button:'right'});await page.getByRole('menuitemcheckbox').click();assert.equal(await button('Export collection').isDisabled(),true);assert.equal(await button('Export pack').isEnabled(),true);
    await page.keyboard.press('Control+s');await page.waitForTimeout(600);saved=JSON.parse(await fs.readFile(copy,'utf8'));assert.ok(saved.scenes.every(s=>s.excludeFromCollection));assert.equal((await app.evaluate(()=>global.saves)).length,1,'Save uses the new path without prompting');
    await second.click({button:'right'});await page.getByRole('menuitemcheckbox').click();assert.equal(await button('Export collection').isEnabled(),true);
    await second.click({button:'right'});await page.getByRole('menuitem',{name:'Delete scene',exact:true}).click();assert.equal(await page.locator('.scene-item').count(),1);assert.equal(await page.locator('h1').textContent(),'First scene');await button('Undo').click();assert.equal(await page.locator('.scene-item').count(),2);
    await second.click({button:'right'});await page.keyboard.press('Escape');assert.equal(await page.getByRole('menu').count(),0);
    await page.keyboard.press('Control+Shift+s');await page.waitForTimeout(600);assert.equal((await app.evaluate(()=>global.saves)).length,2);
    await app.evaluate(({dialog})=>{dialog.showSaveDialog=async()=>({canceled:true});});await button('Save As…').click();
    await button('Save project').or(button('Saved')).click();assert.equal(JSON.parse(await fs.readFile(file,'utf8')).scenes[0].excludeFromCollection,undefined,'Cancel Save As leaves the original file unchanged');
    await app.evaluate(({dialog},copy)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[copy]});},copy);await button('Open').click();await page.locator('.export-excluded').waitFor();
    await page.setViewportSize({width:1120,height:760});await page.locator('main').evaluate(e=>e.scrollTop=0);await checkSize();await page.screenshot({path:'.test-data/editor-qol-small.png'});
    await button('Pin preview').click();await page.locator('main').evaluate(e=>e.scrollTop=e.scrollHeight);await page.waitForTimeout(150);assert.ok((await page.locator('.preview-panel').boundingBox()).y>=71);await page.screenshot({path:'.test-data/editor-qol-pinned-small.png'});
    assert.deepEqual(errors,[]);console.log('Editor QOL verified: preview sizing and sticky playback, compact empty effects, Save As/Save shortcuts, scene exclusion persistence, context deletion/Undo, responsive layout.');
  }catch(error){await (await app.firstWindow()).screenshot({path:'.test-data/editor-qol-failure.png'});throw error;}finally{await app.close();}
})().catch(e=>{console.error(e);process.exit(1);});
