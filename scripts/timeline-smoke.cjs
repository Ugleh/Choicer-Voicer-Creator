const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {MediaEngine}=require('../electron/media.cjs');
(async()=>{
  const data=path.resolve('.test-data','timeline-ui-'+Date.now());await fs.mkdir(data,{recursive:true});
  const source=path.join(data,'timeline.mp4'),engine=new MediaEngine(path.join(data,'cache'),()=>({}));
  await engine.ff(['-f','lavfi','-i','testsrc2=size=160x90:rate=12:duration=120','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=120','-c:v','libx264','-preset','ultrafast','-c:a','aac','-shortest',source]);
  const clips=[{id:'first',start:0,end:1,caption:'First words',character:'A'},{id:'middle',start:35,end:37,caption:'Focus this phrase',character:'B'},{id:'last',start:68,end:70,caption:'Last words',character:'A'}];
  const file=path.join(data,'timeline.cvcreator');await fs.writeFile(file,JSON.stringify({version:1,name:'Timeline test',author:'',media:{path:source,duration:120,audioIndex:1},scenes:[{id:'long',name:'Long scene',start:40,end:110,clips},{id:'other',name:'Other scene',start:10,end:30,clips:[]}]}));
  const launch=process.env.CV_PACKAGED_EXE?{executablePath:path.resolve(process.env.CV_PACKAGED_EXE),args:[]}:{args:[path.resolve('.')]};
  const app=await electron.launch({...launch,env:{...process.env,CV_TEST_DATA:data}});
  try{
    const page=await app.firstWindow(),errors=[];page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));const button=name=>page.getByRole('button',{name,exact:true});
    await page.getByText('FFmpeg ready',{exact:false}).waitFor();await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});dialog.showMessageBox=async()=>({response:1});},file);
    await button('Open').click();await page.locator('.line-row').last().waitFor();
    const pictures=async(min,max)=>{
      await page.waitForFunction(({min,max})=>{const strip=document.querySelector('.filmstrip'),images=[...strip.querySelectorAll('img')];return strip.getAttribute('aria-busy')==='false'&&images.length>=6&&images.every(im=>im.complete&&im.naturalWidth>0&&+im.dataset.time>=min-.1&&+im.dataset.time<max);},{min,max});
      const times=await page.locator('.filmstrip img').evaluateAll(els=>els.map(e=>+e.dataset.time));assert.equal(new Set(times).size,times.length);return times;
    };
    await pictures(40,110);assert.equal(await page.locator('[data-clip-id="middle"]>span').innerText(),'Focus this phrase');assert.equal(await page.locator('.line-row i').nth(1).innerText(),'02');
    const middle=page.locator('.line-row').filter({hasText:'Focus this phrase'});await middle.click();assert.equal(await page.getByLabel('Timeline zoom').inputValue(),'1');
    await middle.dblclick();await page.waitForFunction(()=>+document.querySelector('[aria-label="Timeline zoom"]').value>1);
    const view=await page.locator('.timeline').evaluate(el=>({start:+el.dataset.viewStart,end:+el.dataset.viewEnd,focused:document.activeElement===el,top:el.getBoundingClientRect().top,bottom:el.getBoundingClientRect().bottom,height:innerHeight}));
    assert.ok(view.start<=75&&view.end>=77&&view.end-view.start<=7);assert.ok(view.focused&&view.top>=0&&view.bottom<=view.height);await page.waitForFunction(()=>Math.abs(document.querySelector('video').currentTime-75)<.1&&document.querySelector('video').paused);
    await pictures(view.start,view.end);await page.screenshot({path:'.test-data/timeline-focused.png'});
    for(const [caption,min,max] of [['First words',40,41],['Last words',108,110]]){await page.locator('.line-row').filter({hasText:caption}).dblclick();await page.waitForFunction(({min,max})=>{const el=document.querySelector('.timeline');return +el.dataset.viewStart<=min&&+el.dataset.viewEnd>=max;},{min,max});const range=await page.locator('.timeline').evaluate(el=>[+el.dataset.viewStart,+el.dataset.viewEnd]);assert.ok(range[0]<=min&&range[1]>=max);await pictures(...range);}
    await button('Fit').click();await pictures(40,110);await middle.focus();await middle.press('Enter');await page.waitForFunction(()=>+document.querySelector('.timeline').dataset.viewStart>70);
    await button('Fit').click();await page.locator('[data-clip-id="middle"]').dblclick();await page.waitForFunction(()=>+document.querySelector('.timeline').dataset.viewStart>70);
    await page.locator('.line-row').first().click();await page.locator('.line-row').last().click({modifiers:['Control']});assert.equal(await page.locator('.line-row.active').count(),2);
    await page.locator('.scene-item').last().click();await pictures(10,30);await page.locator('.source-item').click();await pictures(0,120);
    await assert.rejects(page.evaluate(()=>window.creator.timelineThumbnails('C:\\unselected.mp4',0,10,12)),/Select this media/);
    await page.locator('.scene-item').first().click();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1120,760));await middle.dblclick();await pictures(73,79);await page.screenshot({path:'.test-data/timeline-focused-small.png'});
    await button('Save project').click();await button('Saved').waitFor();assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')).scenes[0].clips,clips);assert.deepEqual(errors,[]);
    console.log('Timeline UI passed: double-click/Enter focus, edge lines, timeline clip focus, fit, Ctrl-selection, local pictures across scene/source/zoom, minimum width, and unchanged line data.');
  }catch(error){const page=await app.firstWindow();console.error(await page.locator('body').innerText());await page.screenshot({path:'.test-data/timeline-failure.png',fullPage:true});throw error;}finally{await app.evaluate(({app})=>app.exit(0));await app.close().catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1;});
