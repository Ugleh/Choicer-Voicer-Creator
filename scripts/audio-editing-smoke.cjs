const {menuAction,waitSaved}=require('./menu-test.cjs');
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {MediaEngine}=require('../electron/media.cjs');
(async()=>{
  const fixture=JSON.parse(await fs.readFile('.test-data/fixture-path.json','utf8'));
  const data=await fs.mkdtemp(path.resolve('.test-data','audio-ui-')),file=path.join(data,'collection.cvcreator'),replacement=path.join(data,'replacement.wav');
  const engine=new MediaEngine(path.join(data,'probe'),()=>({}));await engine.ff(['-f','lavfi','-i','sine=frequency=660:duration=1:sample_rate=48000','-ac','2','-c:a','pcm_s16le',replacement]);
  const scene={id:'first',name:'Audio workshop',start:2,end:6,clips:[{id:'line',start:.2,end:.8,caption:'A line',character:'Speaker'}],normalize:false,backing:{path:fixture.backing,duration:4,sourceStart:2,sourceEnd:6,audioIndex:1,reviewed:true}};
  await fs.writeFile(file,JSON.stringify({version:1,name:'Audio workshop',media:{path:fixture.mkv,duration:8.021,audioIndex:1},scenes:[scene]}));
  const launch=process.env.CV_PACKAGED_EXE?{executablePath:path.resolve(process.env.CV_PACKAGED_EXE),args:[]}:{args:[path.resolve('.')]};
  const app=await electron.launch({...launch,env:{...process.env,CV_TEST_DATA:data}});
  try{
    const page=await app.firstWindow();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));const button=name=>page.getByRole('button',{name,exact:true});
    await page.getByText('FFmpeg ready',{exact:false}).waitFor();
    await app.evaluate(({app,dialog},args)=>{
      const require=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/package.json');
      const path=require('node:path'),fs=require('node:fs/promises'),AdmZip=require(path.join(app.getAppPath(),'node_modules/adm-zip'));
      const {ElevenLabs}=require(path.join(app.getAppPath(),'electron/providers.cjs'));
      const run=ElevenLabs.prototype.run;global.audioTestCalls=[];
      ElevenLabs.prototype.run=async function(kind,media,scene,options){
        global.audioTestCalls.push({kind,options});
        this.fetchImpl=async(url,request)=>{
          const wav=await fs.readFile(args.replacement);
          if(url.includes('sound-generation'))return new Response(wav,{headers:{'request-id':'test-effect'}});
          const zip=new AdmZip();zip.addFile('instrumental.wav',wav);zip.addFile('vocals.wav',wav);return new Response(zip.toBuffer(),{headers:{'request-id':'test-range'}});
        };
        return run.call(this,kind,media,scene,options);
      };
      dialog.showOpenDialog=async()=>({canceled:false,filePaths:[args.file]});dialog.showMessageBox=async()=>({response:1});dialog.showSaveDialog=async()=>({canceled:false,filePath:args.file});
    },{file,replacement});
    await menuAction(page,'open');await page.locator('.line-row').waitFor();
    await menuAction(page,'settings');await page.getByLabel('API key',{exact:true}).fill('test-only-not-a-real-key');await button('Save settings').click();
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},fixture.backing);
    await button('Import sound effect').click();await page.getByLabel('Effect name',{exact:true}).waitFor();
    await button('Collapse sound effects').click();assert.equal(await page.getByLabel('Effect name',{exact:true}).count(),0);assert.ok((await page.locator('.sound-effects-panel').boundingBox()).height<100);await button('Expand sound effects').click();await page.getByLabel('Effect name',{exact:true}).waitFor();
    const time=async(label,value)=>{const field=page.getByRole('textbox',{name:label,exact:true});await field.fill(value);await field.press('Enter');};
    await page.getByLabel('Effect name',{exact:true}).fill('Imported impact');await time('Effect end time','1');await time('Effect start time','1');
    await time('Effect source in time','0.25');
    await page.getByLabel('Effect volume',{exact:true}).evaluate(input=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'50');input.dispatchEvent(new Event('input',{bubbles:true}));});await page.getByLabel('Effect fade in',{exact:true}).fill('.05');await page.getByLabel('Effect fade out',{exact:true}).fill('.1');
    await page.locator('.effect-row').first().click();await page.keyboard.press('Control+c');await page.keyboard.press('Control+v');assert.equal(await page.locator('.effect-row').count(),2);await page.keyboard.press('Delete');assert.equal(await page.locator('.effect-row').count(),1);await button('Undo').click();assert.equal(await page.locator('.effect-row').count(),2);await page.locator('.effect-row').first().click({button:'right'});await page.getByRole('menuitem',{name:'Copy effect',exact:true}).click();await page.locator('.effect-row').first().click({button:'right'});await page.getByRole('menuitem',{name:'Paste effect',exact:true}).click();assert.equal(await page.locator('.effect-row').count(),3);await page.keyboard.press('Control+z');await button('Undo').click();await page.locator('.effect-row').first().click();
    await button('Play in scene').click();await page.waitForFunction(()=>{const a=document.querySelector('audio[data-sound-effect]');return a&&!a.paused&&a.currentTime>.05;});
    await page.getByRole('checkbox',{name:'Sound effects',exact:true}).uncheck();await page.waitForFunction(()=>document.querySelector('audio[data-sound-effect]').paused);await button('Pause').click();await page.getByRole('checkbox',{name:'Sound effects',exact:true}).check();
    const handle=page.getByRole('button',{name:'Resize sound effect end',exact:true});await handle.scrollIntoViewIfNeeded();let box=await handle.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+35,box.y+box.height/2,{steps:5});await page.mouse.up();assert.ok(await page.getByRole('textbox',{name:'Effect end time',exact:true}).inputValue()>'00:02.000');await button('Undo').click();
    const chip=page.getByRole('button',{name:'Sound effect: Imported impact',exact:true});box=await chip.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+40,box.y+box.height/2,{steps:5});await page.mouse.up();await button('Undo').click();
    await button('Separate a selected range').click();await time('Backing start time','0.5');await time('Backing end time','1.5');
    await button('Separate selected range').click();await page.getByLabel('Range separation source').selectOption('original');await button('Upload range & run').click();await page.getByText('Selected backing range replaced.',{exact:false}).waitFor();
    await menuAction(page,'save');await waitSaved(page);let saved=JSON.parse(await fs.readFile(file,'utf8'));const repaired=saved.scenes[0].backing.path;assert.notEqual(repaired,fixture.backing);assert.equal(saved.scenes[0].backing.repairedRange.source,'original');assert.equal(saved.scenes[0].backing.reviewed,false);assert.equal(saved.scenes[0].effects.length,1);
    await button('Undo').click();await menuAction(page,'save');await waitSaved(page);saved=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(saved.scenes[0].backing.path,fixture.backing);await button('Redo').click();
    await button('Separate a selected range').click();await time('Backing start time','0.5');await time('Backing end time','1.5');await button('Separate selected range').click();await page.getByLabel('Range separation source').selectOption('backing');await button('Upload range & run').click();await page.getByText('Selected backing range replaced.',{exact:false}).waitFor();
    await page.getByRole('checkbox',{name:'I listened and checked the backing track'}).check();
    await button('Generate with ElevenLabs').click();await page.getByLabel('Sound effect prompt').fill('A glass impact');await page.getByLabel('Generated effect duration').fill('1');await page.getByLabel('Generated effect duration').press('Enter');await time('Generated effect start time','2');await button('Generate 4 sound effects').click();await page.getByRole('dialog',{name:'Choose sound effects',exact:true}).waitFor();
    assert.equal(await page.locator('.sound-choice').count(),4);assert.equal(await page.locator('.effect-row').count(),1);assert.equal(await button('Import selected (0)').isDisabled(),true);
    await button('Play option 1').click();await page.waitForFunction(()=>{const a=document.querySelector('audio[data-sound-choice="1"]');return a&&!a.paused&&a.currentTime>.03;});
    await button('Play option 2').click();await page.waitForFunction(()=>document.querySelector('audio[data-sound-choice="1"]').paused&&!document.querySelector('audio[data-sound-choice="2"]').paused);assert.equal(await page.locator('video').evaluate(e=>e.paused),true);
    await page.getByRole('checkbox',{name:'Import option 1',exact:true}).check();await page.getByRole('checkbox',{name:'Import option 3',exact:true}).check();await page.screenshot({path:'.test-data/sound-choices.png'});
    await button('Import selected (2)').click();await page.getByText('2 sound effects added.',{exact:false}).waitFor();assert.equal(await page.locator('.effect-row').count(),3);assert.equal(await page.locator('audio[data-sound-choice]').count(),0);
    await button('Undo').click();assert.equal(await page.locator('.effect-row').count(),1);await button('Redo').click();assert.equal(await page.locator('.effect-row').count(),3);
    await menuAction(page,'save');await waitSaved(page);await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);await menuAction(page,'open');await page.locator('.effect-row').nth(1).waitFor();
    await page.locator('.effect-row').first().click();assert.equal(await page.getByLabel('Effect volume',{exact:true}).inputValue(),'50');assert.equal(await page.getByLabel('Effect fade in',{exact:true}).inputValue(),'0.05');assert.equal(await page.getByRole('textbox',{name:'Effect source in time',exact:true}).inputValue(),'00:00.250');
    await button('Trim scene').click();await time('Trim scene start time','0.5');await time('Trim scene end time','3.5');await button('Apply trim').click();await menuAction(page,'save');await waitSaved(page);saved=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(saved.scenes[0].effects[0].start,.5);assert.equal(saved.scenes[0].effects[1].start,1.5);assert.equal(saved.scenes[0].effects[2].start,1.5);await button('Undo').click();
    const output=path.join(data,'export');await fs.mkdir(output);await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},output);await button('Export collection').click();await page.getByRole('dialog',{name:'Your packs are ready'}).waitFor();assert.equal((await engine.probe(path.join(output,'Audio workshop','_backing_track.wav'))).duration,4);await button('Done').click();
    await menuAction(page,'settings');const settings=await page.evaluate(()=>window.creator.settings());assert.equal(settings.jobs.length,6);assert.ok(settings.jobs.every(j=>j.status==='succeeded'));assert.equal(settings.jobs.find(j=>j.kind==='sound-effect').estimatedUsd,.002);await page.getByRole('button',{name:'Close dialog'}).click();
    await page.locator('.effect-row').first().click();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1120,760));await page.locator('.sound-effects-panel').scrollIntoViewIfNeeded();await page.screenshot({path:'.test-data/audio-editing-small.png'});
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1500,1100));await page.locator('.timeline-panel').scrollIntoViewIfNeeded();await page.screenshot({path:'.test-data/audio-editing.png'});
    assert.deepEqual(errors,[]);console.log('Audio editing UI passed: import, timing, volume/fades, preview toggle, drag/resize Undo, both range sources, repair Undo, generated effects, save/reopen, trim, export, job estimates and small-window layout. No paid API requests.');
  }catch(error){const page=await app.firstWindow();console.error(await page.locator('body').innerText());await page.screenshot({path:'.test-data/audio-editing-failure.png'});throw error;}finally{await app.evaluate(({app})=>app.exit(0));await app.close().catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1;});
