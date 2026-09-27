const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {MediaEngine}=require('../electron/media.cjs');

(async () => {
  const fixture = JSON.parse(await fs.readFile('.test-data/fixture-path.json', 'utf8'));
  const data = path.resolve('.test-data', 'drop-' + Date.now());
  await fs.mkdir(data, { recursive: true });
  const engine=new MediaEngine(path.join(data,'fixture-cache'),()=>({})),samples={};
  for(const [extension,codecs] of [['MOV',['-c','copy']],['avi',['-c:v','mpeg4','-q:v','5','-c:a','pcm_s16le']],['webm',['-c:v','libvpx-vp9','-deadline','realtime','-cpu-used','8','-c:a','libopus']]]){
    samples[extension]=path.join(data,'sample.'+extension);
    await engine.ff(['-i',fixture.source,'-t','2','-map','0:v:0','-map','0:a:0',...codecs,samples[extension]]);
  }
  const launch = process.env.CV_PACKAGED_EXE
    ? { executablePath: path.resolve(process.env.CV_PACKAGED_EXE), args: [] }
    : { args: [path.resolve('.')] };
  const app = await electron.launch({ ...launch, env: { ...process.env, CV_TEST_DATA: data } });
  const page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.getByText('Make a scene worth repeating.').waitFor();
    await page.getByText('FFmpeg ready', { exact: false }).waitFor();
    await app.evaluate(({ dialog }) => {
      dialog.showOpenDialog = async () => { throw new Error('A drop must not open a file chooser.'); };
    });
    // A real disk-backed File is required: a JS-created File has no OS path.
    // Chromium's file input supplies one without mocking the preload bridge.
    await page.evaluate(() => {
      const input = document.createElement('input');
      input.id = 'drop-fixture'; input.type = 'file'; input.multiple = true; input.hidden = true;
      document.body.append(input);
    });
    async function loadFiles(files) { await page.locator('#drop-fixture').setInputFiles(files); }
    async function dispatch(type, selector = 'main') {
      return page.evaluate(({ type, selector }) => {
        const transfer = new DataTransfer();
        for (const file of document.querySelector('#drop-fixture').files) transfer.items.add(file);
        const event = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer });
        document.querySelector(selector).dispatchEvent(event);
        return event.defaultPrevented;
      }, { type, selector });
    }
    async function drop(files, selector) { await loadFiles(files); assert.equal(await dispatch('drop', selector), true); }
    async function assertNotice(text) { await page.getByRole('alert').getByText(text, { exact: false }).waitFor(); }

    await loadFiles([fixture.mkv]);
    assert.equal(await dispatch('dragenter'), true);
    await page.getByText('Drop your video here', { exact: true }).waitFor();
    assert.equal(await dispatch('dragover'), true);
    await dispatch('dragenter', '.welcome-art');
    await dispatch('dragleave');
    await page.getByText('Drop your video here', { exact: true }).waitFor();
    await page.screenshot({ path: '.test-data/video-drop.png' });
    await dispatch('dragleave', '.welcome-art');
    await page.getByText('Drop your video here', { exact: true }).waitFor({ state: 'hidden' });

    await drop([fixture.backing]);
    await assertNotice('Choose one supported video file');
    await drop([fixture.mkv, fixture.source]);
    await assertNotice('Drop one video at a time.');
    await page.evaluate(() => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(['fake'], 'virtual.mp4', { type: 'video/mp4' }));
      document.querySelector('main').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    });
    await assertNotice('This item is not a local file.');

    await drop([fixture.mkv]);
    await page.getByRole('status').filter({ hasText: 'Editing will be available' }).waitFor();
    // A second drop must not race the first preview-generation job.
    await drop([fixture.source], '.app-header');
    await assertNotice('Wait for the current operation');
    await page.getByRole('button', { name: 'Create scene', exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
    assert.equal(await page.locator('.source-item small').textContent(), 'source.mkv');
    assert.equal(await page.getByText('Drop your video here', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Create scene', exact: true }).click();
    const oldProject = path.join(data, 'original.cvcreator');
    await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, oldProject);
    await page.getByRole('button', { name: 'Save project', exact: true }).click();
    await page.getByRole('button', { name: 'Saved', exact: true }).waitFor();

    await drop([fixture.source], '.app-header');
    await page.getByRole('dialog', { name: 'Replace the source video?' }).waitFor();
    await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
    assert.equal(await page.locator('.source-item small').textContent(), 'source.mkv');
    assert.equal(await page.locator('.scene-item').count(), 1);

    await drop([fixture.source]);
    await page.getByRole('button', { name: 'Start new collection', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.source-item small')?.textContent === 'source.mp4');
    await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
    assert.equal(await page.locator('.scene-item').count(), 0);
    const newProject = path.join(data, 'replacement.cvcreator');
    await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, newProject);
    await page.getByRole('button', { name: 'Save project', exact: true }).click();
    await page.getByRole('button', { name: 'Saved', exact: true }).waitFor();
    assert.equal(JSON.parse(await fs.readFile(oldProject, 'utf8')).scenes.length, 1);
    assert.equal(JSON.parse(await fs.readFile(newProject, 'utf8')).media.path, fixture.source);

    // Uppercase MOV through the native picker, WebM through a disk-backed drop,
    // and AVI through the missing-source locator exercise different import paths.
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async(_win,options)=>{global.__videoFilters=options.filters;return {canceled:false,filePaths:[file]};};},samples.MOV);
    await page.getByRole('button',{name:'Replace video',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.source-item small')?.textContent==='sample.MOV');
    await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
    const importFilters=await app.evaluate(()=>global.__videoFilters[0].extensions);assert.ok(['mov','avi','webm','wmv','m2ts'].every(ext=>importFilters.includes(ext)));
    await drop([samples.webm]);await page.waitForFunction(()=>document.querySelector('.source-item small')?.textContent==='sample.webm');await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
    const missingProject=path.join(data,'missing-source.cvcreator');await fs.writeFile(missingProject,JSON.stringify({version:1,name:'Relocated video',media:{path:path.join(data,'missing.avi'),duration:2,audioIndex:1},scenes:[]}));
    await app.evaluate(({dialog},{project,video})=>{dialog.showMessageBox=async()=>({response:1});dialog.showOpenDialog=async(_win,options)=>{if(options.title==='Locate the original video')global.__relocateFilters=options.filters;return {canceled:false,filePaths:[options.title==='Locate the original video'?video:project]};};},{project:missingProject,video:samples.avi});
    await page.getByRole('button',{name:'Open',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.source-item small')?.textContent==='sample.avi');await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
    assert.deepEqual(await app.evaluate(()=>global.__relocateFilters[0].extensions),importFilters);
    const audioOnly=path.join(data,'audio-only.mov');await fs.copyFile(fixture.backing,audioOnly);await drop([audioOnly]);await assertNotice('Choose a video containing both a video track and an audio track.');assert.equal(await page.locator('.source-item small').textContent(),'sample.avi');
    assert.deepEqual(errors, []);
    console.log('Video import passed: MKV/MP4 drop regression, native uppercase MOV, VP9/Opus WebM drop, AVI source relocation, playable previews, audio-only rejection, matched filters, and preserved project saves.');
  } finally {
    await app.evaluate(({ app }) => app.exit(0));
    await app.close().catch(() => {});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
