const {menuAction,waitSaved}=require('./menu-test.cjs');
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
  const fixture=JSON.parse(await fs.readFile('.test-data/fixture-path.json','utf8'));
  const data=await fs.mkdtemp(path.resolve('.test-data','project-menu-')),file=path.join(data,'original.cvcreator'),fresh=path.join(data,'new.cvcreator');
  const original={version:1,name:'Original collection',media:{path:fixture.mkv,duration:8.021,audioIndex:1},scenes:[{id:'first',name:'First scene',start:2,end:6,clips:[{id:'line',start:.2,end:.8,caption:'Original line',character:'A'}],normalize:false}]};
  await fs.writeFile(file,JSON.stringify(original));
  const launch=process.env.CV_PACKAGED_EXE?{executablePath:path.resolve(process.env.CV_PACKAGED_EXE),args:[]}:{args:[path.resolve('.')]};
  const app=await electron.launch({...launch,env:{...process.env,CV_TEST_DATA:data}});
  try{
    const page=await app.firstWindow();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const button=name=>page.getByRole('button',{name,exact:true});
    const menu=id=>menuAction(page,id);
    await page.getByText('FFmpeg ready',{exact:false}).waitFor();
    await page.getByRole('navigation',{name:'Application menu'}).waitFor();
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});dialog.showMessageBox=async()=>({response:1});dialog.showSaveDialog=async()=>({canceled:true});},file);
    await menu('open');await page.locator('.line-row').waitFor();
    await page.locator('.line-row').click();await menu('delete');await page.waitForFunction(()=>!document.querySelector('.line-row'));await menu('undo');await page.locator('.line-row').waitFor();await menu('redo');await page.waitForFunction(()=>!document.querySelector('.line-row'));await menu('undo');await page.locator('.line-row').waitFor();
    await page.getByLabel('Collection name',{exact:true}).fill('Keep these edits');
    await menu('new');await page.getByRole('dialog',{name:'Start a new project?'}).waitFor();await button('Keep editing').click();assert.equal(await page.locator('.line-row').count(),1);
    await menu('new');await button('Save & continue').click();await page.getByText('New project ready.',{exact:false}).waitFor();
    assert.equal(JSON.parse(await fs.readFile(file,'utf8')).name,'Keep these edits','Save before new writes the old project');assert.equal(await page.locator('.scene-item').count(),0);assert.ok(await button('Undo').isDisabled());
    await app.evaluate(({dialog},video)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[video]});},fixture.mkv);
    await page.keyboard.press('Control+Shift+O');await page.locator('video').waitFor();await page.getByText('Video imported.',{exact:false}).waitFor();
    await menu('new');await button('Save & continue').click();await page.waitForTimeout(300);assert.equal(await page.getByRole('dialog',{name:'Start a new project?'}).count(),1,'Cancelled Save keeps new-project prompt and current video');await button('Keep editing').click();
    await app.evaluate(({dialog},fresh)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:fresh});},fresh);
    await menu('save');await page.getByText('Collection saved.',{exact:false}).waitFor();assert.ok(JSON.parse(await fs.readFile(fresh,'utf8')).media);assert.equal(JSON.parse(await fs.readFile(file,'utf8')).name,'Keep these edits','New project does not overwrite previous save path');
    await menu('video');await page.getByRole('dialog',{name:'Replace the source video?'}).waitFor();await app.evaluate(({dialog})=>{dialog.showOpenDialog=async()=>({canceled:true,filePaths:[]});});await button('Start new collection').click();await page.waitForTimeout(300);assert.equal(await page.locator('video').count(),1,'Cancelled video picker preserves source');
    await menu('help');await page.getByRole('dialog',{name:'A scene-to-pack workflow'}).waitFor();await button('Back to editing').click();
    await menu('settings');await page.getByRole('dialog').waitFor();await button('Close dialog').click();
    await menu('new');await button('Start new collection').click();await page.getByText('New project ready.',{exact:false}).waitFor();assert.equal(await page.locator('video').count(),0);
    await page.screenshot({path:'.test-data/project-menu.png'});assert.deepEqual(errors,[]);
    console.log('Project/menu checks passed: visible menus, keyboard Open Video, Save & continue, save cancellation, fresh save path, cancelled import, cleared Undo, settings and help.');
  }finally{await app.evaluate(({app})=>app.exit(0));await app.close().catch(()=>{});}
})().catch(error=>{console.error(error);process.exitCode=1;});
