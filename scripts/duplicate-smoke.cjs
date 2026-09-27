const {menuAction,waitSaved}=require('./menu-test.cjs');
const {_electron:electron}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');
const {MediaEngine}=require('../electron/media.cjs');
(async()=>{
  const fixture=JSON.parse(await fs.readFile('.test-data/fixture-path.json','utf8')),data=path.resolve('.test-data','duplicate-'+Date.now());await fs.mkdir(data,{recursive:true});
  const file=path.join(data,'chorus.cvcreator');
  const original={id:'original',caption:'Together!',character:'Speaker A',start:.5,end:1.5};
  await fs.writeFile(file,JSON.stringify({version:1,name:'Chorus',author:'Test',description:'',media:{path:fixture.mkv,duration:8.021,audioIndex:1},scenes:[{linePadding:0,id:'scene',name:'Same words',start:2,end:6,clips:[original],normalize:true,backing:{path:fixture.backing,duration:4,sourceStart:2,sourceEnd:6,audioIndex:1,reviewed:true}}]}));
  const launch=process.env.CV_PACKAGED_EXE?{executablePath:path.resolve(process.env.CV_PACKAGED_EXE),args:[]}:{args:[path.resolve('.')]};
  const app=await electron.launch({...launch,env:{...process.env,CV_TEST_DATA:data}});
  try{
    const page=await app.firstWindow(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));const button=name=>page.getByRole('button',{name,exact:true});
    const count=async n=>page.waitForFunction(n=>document.querySelectorAll('.line-row').length===n,n);
    const selected=async n=>page.waitForFunction(n=>document.querySelectorAll('.line-row[aria-pressed=true]').length===n,n);
    await page.getByText('FFmpeg ready',{exact:false}).waitFor();
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});dialog.showMessageBox=async()=>({response:1});},file);
    await menuAction(page,'open');await count(1);await page.locator('.line-row').click();await button('Duplicate line').click();await count(2);await selected(1);
    assert.equal(await page.getByLabel('Caption',{exact:true}).inputValue(),'Together!');assert.equal(await page.getByLabel('Line start time',{exact:true}).inputValue(),'00:00.500');assert.equal(await page.getByLabel('Line end time',{exact:true}).inputValue(),'00:01.500');
    await page.waitForFunction(()=>document.activeElement?.getAttribute('list')==='characters');
    assert.deepEqual(await page.getByLabel('Character',{exact:true}).evaluate(el=>[el.selectionStart,el.selectionEnd]),[0,9]);
    await button('Undo').click();await count(1);await button('Redo').click();await count(2);await page.locator('.line-row').nth(1).click();
    await page.getByLabel('Character',{exact:true}).fill('Speaker B');
    for(const character of ['Speaker C','Speaker D']){await button('Duplicate line').click();await page.getByLabel('Character',{exact:true}).fill(character);}
    await count(4);assert.match(await page.locator('.line-row').first().innerText(),/Speaker A/);
    await page.getByLabel('Caption',{exact:true}).fill('Edited copy');assert.equal(await page.locator('.line-row').filter({hasText:'Edited copy'}).count(),1);await button('Undo').click();
    await page.waitForFunction(()=>document.querySelector('[aria-label="Caption"]').value==='Together!');
    await button('Play line').click();await page.waitForFunction(()=>document.querySelector('video')?.currentTime>2.6&&document.querySelectorAll('.preview-caption').length===4);await button('Pause').click();
    await page.screenshot({path:'.test-data/duplicate-lines.png',fullPage:true});
    await page.locator('.line-row').filter({hasText:'Speaker A'}).click();await page.locator('.line-row').filter({hasText:'Speaker B'}).click({modifiers:['Control']});
    await button('Duplicate selected lines').click();await count(6);await selected(2);assert.match(await page.locator('.line-row[aria-pressed=true]').nth(0).innerText(),/Speaker A/);assert.match(await page.locator('.line-row[aria-pressed=true]').nth(1).innerText(),/Speaker B/);
    await button('Undo').click();await count(4);await button('Redo').click();await count(6);await button('Undo').click();await count(4);
    await menuAction(page,'save');await waitSaved(page);const saved=JSON.parse(await fs.readFile(file,'utf8')),clips=saved.scenes[0].clips;
    assert.equal(new Set(clips.map(c=>c.id)).size,4);assert.deepEqual(clips.find(c=>c.id==='original'),original);assert.deepEqual(clips.map(c=>c.character),['Speaker A','Speaker B','Speaker C','Speaker D']);
    for(const clip of clips)assert.deepEqual([clip.caption,clip.start,clip.end],['Together!',.5,1.5]);
    await menuAction(page,'open');await count(4);await page.locator('.line-row').filter({hasText:'Speaker D'}).click();assert.equal(await page.getByLabel('Line start time',{exact:true}).inputValue(),'00:00.500');
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1120,760));await button('Duplicate line').scrollIntoViewIfNeeded();
    const layout=await page.locator('.line-inspector').evaluate(el=>({scroll:el.scrollWidth,client:el.clientWidth}));assert.ok(layout.scroll<=layout.client+1);await page.screenshot({path:'.test-data/duplicate-lines-small.png'});
    const root=path.join(data,'export');await fs.mkdir(root);await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},root);
    await button('Export pack').click();await page.getByRole('dialog',{name:'Your packs are ready'}).waitFor();
    const pack=path.join(root,(await fs.readdir(root))[0]),files=await fs.readdir(pack),wavs=files.filter(f=>/^\d.*\.wav$/.test(f)).sort(),engine=new MediaEngine('',()=>({}));assert.equal(wavs.length,4);
    for(let i=0;i<4;i++){const wav=wavs[i];assert.ok(Math.abs((await engine.probe(path.join(pack,wav))).duration-1)<.01);const ini=await fs.readFile(path.join(pack,wav.replace(/\.wav$/,'.ini')),'utf8');assert.match(ini,/dub_timestamps=\[0\.500\]/);assert.ok(ini.includes(`dub_characters=["Speaker ${'ABCD'[i]}"]`));}
    assert.deepEqual(errors,[]);console.log('Duplication passed: same-time copies, Character focus, independent editing, single/bulk Undo and Redo, four simultaneous captions, save/reopen, minimum width, and four distinct WAV/INI exports.');
  }finally{await app.evaluate(({app})=>app.exit(0));await app.close().catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1;});
