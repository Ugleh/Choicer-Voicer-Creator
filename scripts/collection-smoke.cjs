const {_electron:electron}=require('playwright');const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {MediaEngine}=require('../electron/media.cjs');
const {version}=require('../package.json');
(async()=>{
 const fixture=JSON.parse(await fs.readFile('.test-data/fixture-path.json','utf8')),data=path.resolve('.test-data','collection-ui-'+Date.now());await fs.mkdir(data,{recursive:true});
 const engine=new MediaEngine(path.join(data,'cache'),()=>({})),backing=path.join(data,'backing.wav');await engine.ff(['-i',fixture.backing,'-t','2','-c:a','pcm_s16le',backing]);
 const file=path.join(data,'collection.cvcreator'),scenes=[2,4].map((start,i)=>({linePadding:0,id:`s${i}`,name:i?'Second':'First',start,end:start+2,clips:[{id:`c${i}`,start:.25,end:1.25,caption:`Line ${i+1}`,character:`Character ${i+1}`}],backing:{path:backing,duration:2,sourceStart:start,sourceEnd:start+2,audioIndex:1,reviewed:true},normalize:true}));
 await fs.writeFile(file,JSON.stringify({version:1,name:'original-source-file',author:'',description:'',media:{path:fixture.mkv,duration:8.021,audioIndex:1},scenes}));
 const launch=process.env.CV_PACKAGED_EXE?{executablePath:path.resolve(process.env.CV_PACKAGED_EXE),args:[]}:{args:[path.resolve('.')]};
 const app=await electron.launch({...launch,env:{...process.env,CV_TEST_DATA:data}});
 try{
  const page=await app.firstWindow(),errors=[];page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));const button=name=>page.getByRole('button',{name,exact:true});
  await page.getByText('FFmpeg ready',{exact:false}).waitFor();await page.locator('.app-version').getByText(`v${version}`,{exact:true}).waitFor();assert.ok((await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getTitle())).endsWith(`v${version}`));
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});dialog.showMessageBox=async()=>({response:1});},file);await button('Open').click();await page.locator('.scene-item').nth(1).waitFor();
  await page.locator('.source-item').click();await page.getByLabel('Pack title',{exact:true}).fill('Kung Pow Favorites');await page.getByLabel('Pack author',{exact:true}).fill('Creator');
  await page.screenshot({path:'.test-data/pack-title.png',fullPage:true});await button('Save project').click();await button('Saved').waitFor();assert.equal(JSON.parse(await fs.readFile(file,'utf8')).packTitle,'Kung Pow Favorites');
  await button('Open').click();await page.locator('.source-item').click();assert.equal(await page.getByLabel('Pack title',{exact:true}).inputValue(),'Kung Pow Favorites');
  await app.evaluate(({dialog})=>{dialog.showOpenDialog=async()=>({canceled:true,filePaths:[]});});await button('Export collection').click();await button('Export collection').waitFor();assert.equal(await page.getByRole('dialog',{name:'Your packs are ready'}).count(),0);
  const root=path.join(data,'combined');await fs.mkdir(root);await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},root);
  await button('Export collection').click();await page.getByText('Combined 2 scenes into one pack',{exact:false}).waitFor();assert.deepEqual(await fs.readdir(root),['Kung Pow Favorites']);
  const combined=path.join(root,'Kung Pow Favorites');assert.match(await fs.readFile(path.join(combined,'_pack_info.ini'),'utf8'),/title="Kung Pow Favorites"/);assert.match(await fs.readFile(path.join(combined,'02_Line2.ini'),'utf8'),/dub_timestamps=\[2\.250\]/);assert.equal((await engine.probe(path.join(combined,'_backing_track.wav'))).duration,4);
  await page.screenshot({path:'.test-data/combined-export.png'});await button('Done').click();await page.locator('.scene-item').first().click();
  const individual=path.join(data,'individual');await fs.mkdir(individual);await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},individual);await button('Export pack').click();await page.getByRole('dialog',{name:'Your packs are ready'}).waitFor();assert.deepEqual(await fs.readdir(individual),['Kung Pow Favorites - First']);assert.match(await fs.readFile(path.join(individual,'Kung Pow Favorites - First','01_Line1.ini'),'utf8'),/dub_timestamps=\[0\.250\]/);
  await button('Done').click();await button('Settings and usage').click();await page.getByText(`Running v${version}`,{exact:true}).waitFor();await button('Close dialog').click();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1120,760));await page.locator('.source-item').click();await page.getByLabel('Pack title',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'.test-data/pack-title-small.png'});const width=await page.locator('.app-header').evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth}));assert.ok(width.scroll<=width.client+1);assert.deepEqual(errors,[]);
  console.log('Collection UI passed: running version, editable title/author, save/reopen, cancel, combined export, shifted timestamps, individual export, and minimum-width layout.');
 }catch(error){const page=await app.firstWindow();console.error(await page.locator('body').innerText());await page.screenshot({path:'.test-data/collection-ui-failure.png',fullPage:true});throw error;}finally{await app.evaluate(({app})=>app.exit(0));await app.close().catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1;});
