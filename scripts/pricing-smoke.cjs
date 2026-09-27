const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
  const data=path.resolve('.test-data','pricing-ui-'+Date.now());await fs.mkdir(data,{recursive:true});
  const settingsPath=path.join(data,'settings.json'),jobsPath=path.join(data,'jobs.json');
  const legacy={ffmpegPath:'C:\\ffmpeg\\bin\\ffmpeg.exe',ffprobePath:'C:\\ffmpeg\\bin\\ffprobe.exe',encryptedKey:'opaque-test-only',transcribeRate:.01,separateRate:null,unrelated:'keep'};
  const jobs=[{id:'old',time:'2026-09-01T00:00:00Z',kind:'transcribe',scene:'Old request',seconds:120,estimatedUsd:.02,actualUsd:null,status:'succeeded'}];
  await fs.writeFile(settingsPath,JSON.stringify(legacy));await fs.writeFile(jobsPath,JSON.stringify(jobs));
  const launch=process.env.CV_PACKAGED_EXE?{executablePath:path.resolve(process.env.CV_PACKAGED_EXE),args:[]}:{args:[path.resolve('.')]};
  const app=await electron.launch({...launch,env:{...process.env,CV_TEST_DATA:data}});
  try{
    const page=await app.firstWindow(),errors=[];page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
    const button=name=>page.getByRole('button',{name,exact:true}),open=()=>button('Settings and usage').click();
    const tier=page.getByLabel('Subscription tier'),rate=page.getByLabel('Scribe v2 USD per hour'),stems=page.getByLabel('Two stems USD per minute'),hours=page.getByLabel('Scribe v2 included hours per month'),custom=page.getByLabel('Use custom rates');
    await page.getByText('FFmpeg ready',{exact:false}).waitFor();await open();
    assert.equal(await custom.isChecked(),true);assert.equal(await rate.inputValue(),'0.6');assert.equal(await stems.inputValue(),'');assert.equal(await hours.inputValue(),'');
    for(const [plan,allowance] of [['free','4.5'],['starter','27'],['pro','450'],['scale','1359'],['business','4500'],['creator','100']]){
      await tier.selectOption(plan);assert.equal(await rate.inputValue(),'0.22');assert.equal(await rate.isDisabled(),true);assert.equal(await hours.inputValue(),allowance);assert.equal(await stems.inputValue(),'0.075');
    }
    await app.evaluate(({shell})=>{shell.openExternal=async url=>{global.__pricingUrl=url;};});
    await button('Public API pricing ↗').click();assert.equal(await app.evaluate(()=>global.__pricingUrl),'https://elevenlabs.io/pricing/api');
    assert.match(await page.evaluate(async()=>{try{await window.creator.openPricing('https://example.com');return 'accepted';}catch(e){return e.message;}}),/Unknown pricing source/);
    await button('Save settings').click();await page.getByRole('dialog').waitFor({state:'hidden'});
    let saved=JSON.parse(await fs.readFile(settingsPath,'utf8'));assert.equal(saved.pricingMode,'plan');assert.equal(saved.transcribeRate,.22/60);assert.equal(saved.encryptedKey,legacy.encryptedKey);assert.equal(saved.unrelated,'keep');assert.deepEqual(JSON.parse(await fs.readFile(jobsPath,'utf8')),jobs);
    await open();assert.equal(await tier.inputValue(),'creator');assert.equal(await custom.isChecked(),false);
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1120,760));await page.screenshot({path:'.test-data/pricing-settings.png'});
    const size=await page.getByRole('dialog').evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth}));assert.ok(size.scroll<=size.client+1);
    await custom.check();await rate.fill('0.46');await stems.fill('0.125');await hours.fill('48');await button('Save settings').click();await page.getByRole('dialog').waitFor({state:'hidden'});
    saved=JSON.parse(await fs.readFile(settingsPath,'utf8'));assert.equal(saved.transcribeRate,.46/60);assert.equal(saved.transcribeIncludedHours,48);assert.equal(saved.pricingMode,'custom');
    await open();assert.equal(await rate.inputValue(),'0.46');assert.equal(await hours.inputValue(),'48');
    await stems.fill('-1');await button('Save settings').click();await page.getByText('Rates and included hours must be non-negative numbers or blank.',{exact:true}).waitFor();assert.equal(JSON.parse(await fs.readFile(settingsPath,'utf8')).separateRate,.125);
    await stems.fill('');await rate.fill('0');await button('Save settings').click();await page.getByRole('dialog').waitFor({state:'hidden'});
    const blank=await page.evaluate(()=>window.creator.settings());assert.equal(blank.transcribeRate,0);assert.equal(blank.separateRate,null);
    await open();await tier.selectOption('enterprise');assert.equal(await rate.inputValue(),'');assert.equal(await custom.isChecked(),true);assert.equal(await custom.isDisabled(),true);await tier.selectOption('creator');await button('Save settings').click();await page.getByRole('dialog').waitFor({state:'hidden'});
    const fixture=JSON.parse(await fs.readFile('.test-data/fixture-path.json','utf8')),projectFile=path.join(data,'project.cvcreator');
    await fs.writeFile(projectFile,JSON.stringify({version:1,name:'Price fixture',author:'',media:{path:fixture.mkv,duration:8.021,audioIndex:1},scenes:[{id:'scene',name:'Four second scene',start:2,end:6,clips:[]}]}));
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},projectFile);
    await button('Open').click();await button('Separate with ElevenLabs').waitFor();await button('Separate with ElevenLabs').click();
    await page.getByRole('dialog',{name:'Create a backing track'}).waitFor();assert.ok((await page.getByRole('dialog').innerText()).includes('$0.0050'));assert.ok((await page.getByRole('dialog').innerText()).includes('provisional two-stem rate'));
    await button('Cancel').click();await button('Suggest lines with ElevenLabs').click();await page.getByRole('dialog',{name:'Suggest dialogue lines'}).waitFor();assert.ok((await page.getByRole('dialog').innerText()).includes('$0.0002'));await button('Cancel').click();
    assert.deepEqual(JSON.parse(await fs.readFile(jobsPath,'utf8')),jobs);assert.deepEqual(errors,[]);
    console.log('Pricing UI passed: legacy migration, every preset, hourly conversion, saved custom rates/allowance, validation, unknown/zero, source allowlist, estimate confirmation, preserved credentials/history and minimum-width layout. No API requests submitted.');
  }catch(e){const page=await app.firstWindow();console.error(await page.locator('body').innerText());await page.screenshot({path:'.test-data/pricing-failure.png'});throw e;}finally{await app.evaluate(({app})=>app.exit(0));await app.close().catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1;});
