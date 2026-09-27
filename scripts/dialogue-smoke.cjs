const {menuAction,waitSaved}=require('./menu-test.cjs');
const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {MediaEngine}=require('../electron/media.cjs');

(async()=>{
  const {parseTime}=await import('../src/time.mjs');
  const fixture=JSON.parse(await fs.readFile('.test-data/fixture-path.json','utf8'));
  const data=path.resolve('.test-data','dialogue-'+Date.now());await fs.mkdir(data,{recursive:true});
  const seed=path.join(data,'seed.cvcreator');
  const clips=[
    {id:'a',caption:'I mean,',character:'Speaker 1',start:.2,end:.52},
    {id:'b',caption:"that doesn't seem possible.",character:'Speaker 1',start:1.24,end:2.76},
    {id:'c',caption:'Another person.',character:'Speaker 2',start:3,end:3.7},
    {id:'d',caption:'Together!',character:'Speaker 3',start:1.24,end:1.9},
  ];
  const project={version:1,name:'Dialogue test',author:'Test',description:'',media:{path:fixture.mkv,duration:8.021,audioIndex:1},scenes:[{linePadding:0,id:'scene',name:'Scene',start:2,end:6,clips,normalize:true,backing:{path:fixture.backing,duration:4,sourceStart:2,sourceEnd:6,audioIndex:1,reviewed:true}}]};
  await fs.writeFile(seed,JSON.stringify(project));
  const launch=process.env.CV_PACKAGED_EXE?{executablePath:path.resolve(process.env.CV_PACKAGED_EXE),args:[]}:{args:[path.resolve('.')]};
  const app=await electron.launch({...launch,env:{...process.env,CV_TEST_DATA:data}});
  try{
    const page=await app.firstWindow(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
    const button=name=>page.getByRole('button',{name,exact:true});
    const rows=page.locator('.line-row'),row=caption=>rows.filter({hasText:caption});
    async function count(n){await page.waitForFunction(n=>document.querySelectorAll('.line-row').length===n,n);}
    async function picked(n){await page.waitForFunction(n=>document.querySelectorAll('.line-row[aria-pressed=true]').length===n,n);}
    await page.getByText('FFmpeg ready',{exact:false}).waitFor();
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});dialog.showMessageBox=async()=>({response:1});},seed);
    await menuAction(page,'open');await count(4);
    await row('I mean,').click();await row('Another person.').click({modifiers:['Control']});await picked(2);
    assert.equal(await button('Merge lines').isDisabled(),true);
    await page.getByLabel('Character for selected lines').fill('Group');await button('Apply character to 2 lines').click();
    assert.match(await row('I mean,').innerText(),/Group/);assert.match(await row('Another person.').innerText(),/Group/);
    assert.match(await row("that doesn't seem possible.").innerText(),/Speaker 1/);
    await button('Undo').click();await page.getByText('Assign one character to these lines before merging.').waitFor();
    assert.match(await row('Another person.').innerText(),/Speaker 2/);
    // Ctrl-click toggles membership, and an ordinary click returns to one line.
    await row('Another person.').click({modifiers:['Control']});await picked(1);
    await row('I mean,').click({modifiers:['Control']});await picked(0);
    await row("that doesn't seem possible.").click();await row('I mean,').click({modifiers:['Control']});await picked(2);
    await page.getByLabel('Character for selected lines').fill('Nut Vendor');await button('Apply character to 2 lines').click();
    await button('Undo').click();assert.match(await row('I mean,').innerText(),/Speaker 1/);
    await button('Redo').click();assert.match(await row('I mean,').innerText(),/Nut Vendor/);
    await button('Play selected range').click();await page.waitForFunction(()=>document.querySelector('video').currentTime>2.3);await button('Pause').click();
    await page.locator('.line-inspector').scrollIntoViewIfNeeded();await page.screenshot({path:'.test-data/dialogue-multi.png'});
    await button('Merge lines').click();await count(3);await picked(1);
    const mergedCaption="I mean, that doesn't seem possible.";
    assert.equal(await page.locator('.line-inspector textarea').inputValue(),mergedCaption);
    assert.equal(parseTime(await page.getByLabel('Line start time').inputValue()),.2);
    assert.equal(parseTime(await page.getByLabel('Line end time').inputValue()),2.76);
    assert.match(await row('Together!').innerText(),/Speaker 3/);
    await button('Undo').click();await count(4);assert.match(await row('I mean,').innerText(),/Nut Vendor/);
    await button('Redo').click();await count(3);
    await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},path.join(data,'saved.cvcreator'));
    // Open uses its existing save destination, so this writes back to the seed file.
    await menuAction(page,'save');await waitSaved(page);
    const saved=JSON.parse(await fs.readFile(seed,'utf8'));
    assert.equal(saved.scenes[0].clips.length,3);
    assert.deepEqual(saved.scenes[0].clips.find(c=>c.id==='a'),{...clips[0],caption:mergedCaption,character:'Nut Vendor',end:2.76});
    assert.deepEqual(saved.scenes[0].clips.find(c=>c.id==='d'),clips[3]);
    await menuAction(page,'open');await count(3);await row(mergedCaption).click();
    assert.equal(parseTime(await page.getByLabel('Line end time').inputValue()),2.76);
    const root=path.join(data,'export');await fs.mkdir(root);
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},root);
    await button('Export pack').click();await page.getByRole('dialog',{name:'Your packs are ready'}).waitFor();
    const pack=path.join(root,(await fs.readdir(root))[0]),files=await fs.readdir(pack);
    const wav=files.find(f=>f.startsWith('01_')&&f.endsWith('.wav'));
    assert.equal(files.filter(f=>/^\d.*\.wav$/.test(f)).length,3);
    const info=await new MediaEngine('',()=>({})).probe(path.join(pack,wav));assert.ok(Math.abs(info.duration-2.56)<.01);
    const ini=await fs.readFile(path.join(pack,wav.replace(/\.wav$/,'.ini')),'utf8');assert.match(ini,/dub_timestamps=\[0\.200\]/);assert.ok(ini.includes(mergedCaption));
    assert.deepEqual(errors,[]);
    console.log('Dialogue editing passed: Ctrl selection/deselection, mixed characters, batch assignment, chronological merge with pause, undo/redo, save/reopen, and merged WAV/INI export.');
  }finally{await app.evaluate(({app})=>app.exit(0));await app.close().catch(()=>{});}
})().catch(error=>{console.error(error);process.exitCode=1;});
