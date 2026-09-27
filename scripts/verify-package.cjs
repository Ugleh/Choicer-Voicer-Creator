const {_electron:electron}=require('playwright');const path=require('node:path');const fs=require('node:fs/promises');const assert=require('node:assert/strict');
(async()=>{
  const data=path.resolve('.test-data','packaged-'+Date.now());await fs.mkdir(data,{recursive:true});
  const executablePath=process.env.CV_PACKAGED_EXE||path.resolve('release','v'+require('../package.json').version,'win-unpacked/Choicer Voicer Creator.exe');
  const app=await electron.launch({executablePath,args:[],env:{...process.env,CV_TEST_DATA:data}});
  try{
    const page=await app.firstWindow();await page.getByText('New project').waitFor();
    const status=await page.evaluate(()=>window.creator.bootstrap());assert.equal(status.toolStatus.ok,true);assert.equal(status.settings.hasKey,false);
    assert.equal(status.settings.appVersion,require('../package.json').version);
    await page.screenshot({path:'.test-data/packaged-welcome.png'});
    console.log('Packaged EXE verified: renderer, isolated IPC, settings, FFmpeg/FFprobe discovery.');
  }finally{await app.evaluate(({app})=>app.exit(0));await app.close().catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1;});
