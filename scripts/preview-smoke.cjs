const {menuAction,waitSaved}=require('./menu-test.cjs');
const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');

(async()=>{
  const {parseTime}=await import('../src/time.mjs');
  const fixture=JSON.parse(await fs.readFile('.test-data/fixture-path.json','utf8'));
  const data=path.resolve('.test-data','preview-'+Date.now());await fs.mkdir(data,{recursive:true});
  const file=path.join(data,'sixteen-lines.cvcreator');
  const clips=Array.from({length:16},(_,i)=>({id:`line-${i}`,caption:`Spoken line ${i+1}`,character:`Character ${i%4+1}`,start:i*.2,end:(i+1)*.2}));
  clips[1].start=0; // Two speakers begin together, followed by the remaining lines.
  const project={version:1,name:'Scene preview test',author:'Test',description:'',media:{path:fixture.mkv,duration:8.021,audioIndex:1},scenes:[{id:'scene',name:'Sixteen lines',start:2,end:6,clips,backing:{path:fixture.backing,duration:4,sourceStart:2,sourceEnd:6,audioIndex:1,reviewed:true},normalize:true}]};
  await fs.writeFile(file,JSON.stringify(project));
  const launch=process.env.CV_PACKAGED_EXE?{executablePath:path.resolve(process.env.CV_PACKAGED_EXE),args:[]}:{args:[path.resolve('.')]};
  const app=await electron.launch({...launch,env:{...process.env,CV_TEST_DATA:data}});
  try{
    const page=await app.firstWindow(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
    const button=name=>page.getByRole('button',{name,exact:true});
    await page.getByText('FFmpeg ready',{exact:false}).waitFor();
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});dialog.showMessageBox=async()=>({response:1});},file);
    await menuAction(page,'open');await page.getByRole('checkbox',{name:'Show lines',exact:true}).waitFor();
    await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2&&Math.abs(document.querySelector('video').currentTime-2)<.02);
    assert.equal(await page.locator('.line-row').count(),16);
    assert.equal(await page.locator('.line-row[aria-pressed=true]').count(),0);
    assert.equal(await page.locator('.selection-toolbar').count(),0);
    assert.equal(await button('Create scene from selection').count(),0);
    await page.waitForFunction(()=>document.querySelectorAll('.preview-caption').length===2);
    assert.match(await page.locator('.caption-overlay').innerText(),/Character 1/);
    assert.match(await page.locator('.caption-overlay').innerText(),/Spoken line 2/);
    // Watch actual playback without selecting a dialogue row.
    await page.evaluate(()=>{window.seenCaptions=new Set();window.captionObserver=new MutationObserver(()=>document.querySelectorAll('.preview-caption').forEach(el=>window.seenCaptions.add(el.dataset.lineId)));window.captionObserver.observe(document.querySelector('.video-wrap'),{childList:true,subtree:true,characterData:true});document.querySelectorAll('.preview-caption').forEach(el=>window.seenCaptions.add(el.dataset.lineId));});
    await button('Play').click();await page.waitForFunction(()=>window.seenCaptions.size===16);await button('Pause').click();
    assert.equal(await page.locator('.line-row[aria-pressed=true]').count(),0);
    await button('Start of scene').click();await page.waitForFunction(()=>Math.abs(document.querySelector('video').currentTime-2)<.001);
    assert.equal(await button('Previous frame').isDisabled(),true);
    await page.getByRole('checkbox',{name:'Show lines',exact:true}).uncheck();assert.equal(await page.locator('.caption-overlay').count(),0);
    await menuAction(page,'open');await page.getByRole('checkbox',{name:'Show lines',exact:true}).waitFor();
    assert.equal(await page.getByRole('checkbox',{name:'Show lines',exact:true}).isChecked(),false);
    await page.getByRole('checkbox',{name:'Show lines',exact:true}).check();await page.locator('.caption-overlay').waitFor();
    await page.screenshot({path:'.test-data/scene-preview.png'});
    await button('End of scene').click();await page.waitForFunction(()=>Math.abs(document.querySelector('video').currentTime-(6-1/24))<.001);
    assert.equal(await button('Next frame').isDisabled(),true);assert.equal(await page.locator('.caption-overlay').count(),0);
    await button('Play').click();await page.waitForFunction(()=>document.querySelector('video').currentTime>2&&document.querySelector('video').currentTime<3);await button('Pause').click();
    await button('Start of scene').click();
    // Browsing and I/O no longer expose a nested scene/range editor.
    await page.keyboard.press('i');await page.keyboard.press('o');assert.equal(await page.locator('.selection-toolbar').count(),0);
    await button('Add dialogue line').click();await page.getByLabel('New line start time').waitFor();
    await page.getByLabel('New line start time').fill('0.1');await page.getByLabel('New line start time').press('Enter');
    await page.getByLabel('New line end time').fill('0.7');await page.getByLabel('New line end time').press('Enter');
    await button('Cancel new line').click();assert.equal(await page.locator('.line-row').count(),16);assert.equal(await page.locator('.selection-toolbar').count(),0);
    await button('Add dialogue line').click();
    await page.getByLabel('New line start time').fill('0.1');await page.getByLabel('New line start time').press('Enter');
    await page.getByLabel('New line end time').fill('0.7');await page.getByLabel('New line end time').press('Enter');
    await button('Create dialogue line').click();await page.waitForFunction(()=>document.querySelectorAll('.line-row').length===17);
    assert.equal(await page.locator('.selection-toolbar').count(),0);
    assert.equal(parseTime(await page.getByLabel('Line start time').inputValue()),.1);assert.equal(parseTime(await page.getByLabel('Line end time').inputValue()),.7);
    assert.equal(await page.locator('.scene-item').count(),1);
    // An old audition stop point must not pull a paused seek backwards.
    await button('Play line').click();await page.waitForFunction(()=>document.querySelector('video').currentTime>2.2);await button('Pause').click();
    await button('End of scene').click();await page.waitForFunction(()=>Math.abs(document.querySelector('video').currentTime-(6-1/24))<.001);
    await button('Edit scene boundaries in Source').click();await page.getByLabel('Selection in seconds').waitFor();
    assert.equal(+await page.getByLabel('Selection in seconds').inputValue(),2);assert.equal(+await page.getByLabel('Selection out seconds').inputValue(),6);
    assert.equal(await button('Create scene').count(),1);
    await page.locator('.scene-item').click();assert.equal(await page.locator('.selection-toolbar').count(),0);
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1120,760));
    await button('Start of scene').click();await page.getByRole('checkbox',{name:'Show lines',exact:true}).scrollIntoViewIfNeeded();
    const size=await page.locator('.preview-panel').evaluate(el=>({scroll:el.scrollWidth,client:el.clientWidth}));assert.ok(size.scroll<=size.client+1);
    await page.screenshot({path:'.test-data/scene-preview-small.png'});
    assert.deepEqual(errors,[]);
    console.log('Scene preview passed: reopened 16-line playback, overlapping captions, Show lines persistence, scene start/end/frame limits, restart, manual dialogue creation/cancel, no nested scene controls, and minimum-width layout.');
  }finally{await app.evaluate(({app})=>app.exit(0));await app.close().catch(()=>{});}
})().catch(error=>{console.error(error);process.exitCode=1;});
