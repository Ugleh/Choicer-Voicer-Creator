const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

(async()=>{
  const {parseTime}=await import('../src/time.mjs');
  const fixture = JSON.parse(await fs.readFile('.test-data/fixture-path.json', 'utf8'));
  const data = path.resolve('.test-data', 'selection-' + Date.now());
  await fs.mkdir(data, { recursive: true });
  const launch = process.env.CV_PACKAGED_EXE ? { executablePath: path.resolve(process.env.CV_PACKAGED_EXE), args: [] } : { args: [path.resolve('.')] };
  const app = await electron.launch({ ...launch, env: { ...process.env, CV_TEST_DATA: data } });
  try {
    const page = await app.firstWindow(), errors = [];
    page.setDefaultTimeout(15000);
    page.on('pageerror', e => errors.push(e.message));
    await page.getByText('FFmpeg ready', { exact: false }).waitFor();
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, fixture.mkv);
    await page.getByRole('button', { name: 'Choose a video' }).click();
    await page.getByRole('button', { name: 'Create scene', exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
    let inputLabel = 'Selection in seconds', outputLabel = 'Selection out seconds';
    let input = page.getByLabel(inputLabel), output = page.getByLabel(outputLabel);
    const button = name => page.getByRole('button', { name, exact: true });
    async function setRange(a,b) { await input.fill(String(a)); await input.press('Enter'); await output.fill(String(b)); await output.press('Enter'); }
    async function range() { return [parseTime(await input.inputValue()),parseTime(await output.inputValue())]; }
    async function assertRange(a,b,tolerance=.02) {await page.waitForFunction(([a,b,tolerance,inputLabel,outputLabel])=>{const number=v=>v.includes(':')?Number(v.split(':')[0])*60+Number(v.split(':')[1]):Number(v);return Math.abs(number(document.querySelector(`[aria-label="${inputLabel}"]`).value)-a)<tolerance&&Math.abs(number(document.querySelector(`[aria-label="${outputLabel}"]`).value)-b)<tolerance;},[a,b,tolerance,inputLabel,outputLabel]);const actual=await range();assert.ok(Math.abs(actual[0]-a)<tolerance&&Math.abs(actual[1]-b)<tolerance,`Expected [${a}, ${b}], got ${actual}`);}
    const sourceDuration=+await page.getByLabel('Video playhead').getAttribute('max') + +await page.getByLabel('Video playhead').getAttribute('step');
    async function drag(from,to) {
      await page.locator('.timeline').scrollIntoViewIfNeeded();
      const rect=await page.locator('.timeline').boundingBox();
      await page.mouse.move(rect.x+rect.width*from/sourceDuration,rect.y+125);
      await page.mouse.down();await page.mouse.move(rect.x+rect.width*to/sourceDuration,rect.y+125,{steps:8});await page.mouse.up();
    }
    await setRange(2,6);
    await output.fill('');await output.pressSequentially('4.875');await output.press('Enter');await assertRange(2,4.875,.001);
    await output.fill('1');await output.press('Escape');await assertRange(2,4.875,.001);
    await output.fill('');await output.press('Tab');await assertRange(2,4.875,.001);
    await output.fill('6');await output.press('Enter');
    await button('Lock IN').click();
    assert.equal(await input.isDisabled(),true);
    assert.equal(await button('Move IN earlier by one frame').isDisabled(),true);
    await drag(3,5);await assertRange(2,5);
    await page.keyboard.press('i');await assertRange(2,5);
    await button('Move OUT earlier by one frame').click();await assertRange(2,4.958);
    await button('Lock OUT').click();
    await drag(1,7);await page.keyboard.press('o');await page.keyboard.press('i');await assertRange(2,4.958);
    await button('Unlock IN').click();
    await drag(3,1);await assertRange(1,4.958);
    await drag(3,7);await assertRange(4.958,4.958);
    await button('Unlock OUT').click();await setRange(2,6);

    // Each handle changes just its endpoint, even with both sides unlocked.
    const rect=await page.locator('.timeline').boundingBox();
    const handle=await button('Drag selection IN').boundingBox();
    await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();
    await page.mouse.move(rect.x+rect.width*3/sourceDuration,handle.y+handle.height/2,{steps:8});await page.mouse.up();await assertRange(3,6);
    await button('Drag selection OUT').focus();await page.keyboard.press('ArrowLeft');await assertRange(3,5.958);
    await button('Lock IN').click();
    await button('Drag selection IN').focus();await page.keyboard.press('ArrowRight');await assertRange(3,5.958);
    await page.screenshot({path:'.test-data/selection-locks.png'});

    // Re-clicking the same source preserves the range; entering a scene resets locks.
    await page.locator('.source-item').click();await assertRange(3,5.958);
    assert.equal(await input.isDisabled(),true);
    await button('Unlock IN').click();await setRange(2,6);await button('Lock OUT').click();
    await button('Create scene').click();
    assert.equal(await page.locator('.selection-toolbar').count(),0);
    await button('Add dialogue line').click();
    inputLabel='New line start time';outputLabel='New line end time';
    input=page.getByLabel(inputLabel);output=page.getByLabel(outputLabel);
    assert.equal(await output.isDisabled(),false);
    await setRange(0,4);
    await input.fill('0');await input.press('Enter');await assertRange(0,4,.001);
    await output.fill('8');await output.press('Enter');await assertRange(0,4,.001);
    await setRange(.42,1.8);await button('Lock line start').click();await button('Create dialogue line').click();
    assert.equal(await page.locator('.selection-toolbar').count(),0);
    assert.equal(parseTime(await page.getByLabel('Line start time').inputValue()),.42);
    assert.equal(parseTime(await page.getByLabel('Line end time').inputValue()),1.8);
    await page.getByLabel('Line end time').fill('1.65');await page.getByLabel('Line end time').press('Enter');
    assert.equal(parseTime(await page.getByLabel('Line end time').inputValue()),1.65);
    await page.getByLabel('Caption',{exact:true}).fill('First line');
    await button('Add dialogue line').click();await setRange(2,3);await button('Create dialogue line').click();
    await page.getByLabel('Caption',{exact:true}).fill('Second line');
    await button('Add dialogue line').click();await button('Lock line start').click();
    await page.locator('.timeline-clip').filter({hasText:'First line'}).click();
    assert.equal(await page.locator('.selection-toolbar').count(),0);
    assert.equal(parseTime(await page.getByLabel('Line start time').inputValue()),.42);
    assert.equal(parseTime(await page.getByLabel('Line end time').inputValue()),1.65);
    await button('Add dialogue line').click();
    assert.equal(await input.isDisabled(),false);
    // Check the toolbar also fits the app's minimum window size.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1120,760));
    await input.scrollIntoViewIfNeeded();
    const controls=await page.locator('.selection-toolbar').evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth}));
    assert.ok(controls.scroll<=controls.client+1);
    await page.screenshot({path:'.test-data/selection-locks-small.png'});
    assert.deepEqual(errors,[]);
    console.log('Selection controls passed: numeric drafts, Escape/blank, individual/both locks, crossing, drag handles, frame buttons, keyboard, scene bounds, line creation, context resets, minimum-size layout.');
  } finally { await app.evaluate(({app})=>app.exit(0));await app.close().catch(()=>{}); }
})().catch(error=>{console.error(error);process.exitCode=1;});
