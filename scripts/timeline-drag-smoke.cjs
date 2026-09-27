const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
  const fixture=JSON.parse(await fs.readFile('.test-data/fixture-path.json','utf8')),data=await fs.mkdtemp(path.resolve('.test-data','drag-ui-')),file=path.join(data,'drag.cvcreator');
  const effects=[{id:'fx-left',start:.25,end:.75},{id:'fx-right',start:3,end:3.5}].map(e=>({...e,name:e.id,path:fixture.backing,duration:4,offset:0,gain:1,fadeIn:0,fadeOut:0,muted:false}));
  const clips=[{id:'line-left',start:.25,end:.75},{id:'line-right',start:3,end:3.5}].map(e=>({...e,caption:e.id,character:'A'}));
  await fs.writeFile(file,JSON.stringify({version:1,name:'Dragging',media:{path:fixture.mkv,duration:8.021,audioIndex:1},scenes:[{id:'scene',name:'Dragging scene',start:2,end:6,clips,effects}]}));
  const launch=process.env.CV_PACKAGED_EXE?{executablePath:path.resolve(process.env.CV_PACKAGED_EXE),args:[]}:{args:[path.resolve('.')]};const app=await electron.launch({...launch,env:{...process.env,CV_TEST_DATA:data}});
  try{
    const page=await app.firstWindow();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));const button=name=>page.getByRole('button',{name,exact:true});
    await page.getByText('FFmpeg ready',{exact:false}).waitFor();await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});dialog.showMessageBox=async()=>({response:1});},file);await button('Open').click();await page.locator('.effect-clip').first().waitFor();await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
    await page.getByLabel('Scene playhead',{exact:true}).evaluate(input=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'4');input.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.waitForFunction(()=>Math.abs(document.querySelector('video').currentTime-4)<.001);
    async function state(){await button('Save project').or(button('Saved')).click();await button('Saved').waitFor();return JSON.parse(await fs.readFile(file,'utf8')).scenes[0];}
    async function drag(selector,delta,bypass=false){
      const target=page.locator(selector);await target.scrollIntoViewIfNeeded();const rect=await target.boundingBox(),timeline=await page.locator('.timeline').boundingBox(),x=rect.x+rect.width/2,y=rect.y+rect.height/2;
      if(bypass)await page.keyboard.down('Shift');await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+delta/4*timeline.width,y,{steps:8});await page.mouse.up();if(bypass)await page.keyboard.up('Shift');
      assert.ok(Math.abs(await page.locator('video').evaluate(e=>e.currentTime)-4)<.001,'drag must preserve playhead');
    }
    for(const [attribute,key] of [['data-effect-id','effects'],['data-clip-id','clips']]){
      const prefix=key==='effects'?'fx':'line';
      await drag(`[${attribute}="${prefix}-left"]`,1.24);let scene=await state();assert.equal(scene[key][0].end,2);assert.equal(scene[key][0].start,1.5);await button('Undo').click();
      await drag(`[${attribute}="${prefix}-right"]`,-.99);scene=await state();assert.equal(scene[key][1].start,2);assert.equal(scene[key][1].end,2.5);await button('Undo').click();
      await drag(`[${attribute}="${prefix}-left"]`,1.24,true);scene=await state();assert.ok(Math.abs(scene[key][0].end-1.99)<.005);assert.notEqual(scene[key][0].end,2);await button('Undo').click();
      scene=await state();assert.equal(scene[key][0].start,.25);assert.equal(scene[key][1].start,3,'each drag has its own Undo entry');
    }
    // Resizing a selected dialogue edge must also leave the reference playhead fixed.
    await page.locator('[data-clip-id="line-left"]').click();await drag('[aria-label="Resize line 1 end"]',1.24);assert.equal((await state()).clips[0].end,2);await button('Undo').click();
    assert.deepEqual(errors,[]);await page.screenshot({path:'.test-data/timeline-drag.png'});console.log('Timeline drag UI passed: dialogue/effects move and resize, fixed playhead, snapping from both sides, bypass, and independent Undo.');
  }catch(e){await (await app.firstWindow()).screenshot({path:'.test-data/timeline-drag-failure.png'});throw e;}finally{await app.evaluate(({app})=>app.exit(0));await app.close().catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1;});
