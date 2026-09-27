const {_electron:electron}=require('playwright');const path=require('node:path');const fs=require('node:fs/promises');const assert=require('node:assert/strict');
(async()=>{
  const data=path.resolve('.test-data','packaged-'+Date.now());await fs.mkdir(data,{recursive:true});
  const app=await electron.launch({executablePath:path.resolve('release','v'+require('../package.json').version,'win-unpacked/Choicer Voicer Creator.exe'),args:[],env:{...process.env,CV_TEST_DATA:data}});
  try{
    const page=await app.firstWindow();await page.getByText('Make a scene worth repeating.').waitFor();
    const status=await page.evaluate(()=>window.creator.bootstrap());assert.equal(status.toolStatus.ok,true);assert.equal(status.settings.hasKey,false);
    await page.screenshot({path:'.test-data/packaged-welcome.png'});
    console.log('Packaged EXE verified: renderer, isolated IPC, settings, FFmpeg/FFprobe discovery.');
  }finally{await app.evaluate(({app})=>app.exit(0));await app.close().catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1;});
