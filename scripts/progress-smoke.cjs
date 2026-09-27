const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const fixture = JSON.parse(await fs.readFile('.test-data/fixture-path.json', 'utf8'));
  const data = path.resolve('.test-data', 'progress-' + Date.now());
  await fs.mkdir(data, { recursive: true });
  const launch = process.env.CV_PACKAGED_EXE
    ? { executablePath: path.resolve(process.env.CV_PACKAGED_EXE), args: [] }
    : { args: [path.resolve('.')] };
  const app = await electron.launch({ ...launch, env: { ...process.env, CV_TEST_DATA: data } });
  try {
    const page = await app.firstWindow(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.getByText('FFmpeg ready', { exact: false }).waitFor();
    // Control only the long-running operation so startup, stalled and unknown
    // progress can be checked deterministically without transcoding a full film.
    await app.evaluate(({ dialog, ipcMain, BrowserWindow }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
      ipcMain.removeHandler('cv:prepareVideo');
      ipcMain.handle('cv:prepareVideo', () => new Promise(resolve => {
        globalThis.finishProgressTest = resolve;
        BrowserWindow.getAllWindows()[0].webContents.send('cv:progress', {
          label: 'Creating video preview', percent: null,
          detail: 'Step 1 of 3 · Converting the full movie for editing. This copy is cached for next time.',
        });
      }));
      ipcMain.removeHandler('cv:cancel');
      ipcMain.handle('cv:cancel', () => {
        globalThis.finishProgressTest({ ok: false, error: 'Operation cancelled.' });
        return { ok: true, value: true };
      });
    }, fixture.mkv);
    await page.clock.install();
    await page.getByRole('button', { name: 'Open Video…' }).click();
    const panel = page.getByRole('status');
    await panel.getByText('Creating video preview', { exact: true }).waitFor();
    assert.equal(await panel.locator('progress').getAttribute('value'), null);
    const send = value => app.evaluate(({ BrowserWindow }, progress) => {
      BrowserWindow.getAllWindows()[0].webContents.send('cv:progress', progress);
    }, value);
    await send({ label: 'Creating video preview', detail: 'Step 1 of 3 · Converting the full movie for editing. This copy is cached for next time.', percent: 25, processedSeconds: 1200, totalSeconds: 4800, speed: 12, remainingSeconds: 300 });
    await panel.getByText('25.0%', { exact: true }).waitFor();
    await page.clock.fastForward(6000);
    await panel.getByText('About 5m 0s left in this step', { exact: true }).waitFor();
    assert.match(await panel.innerText(), /Processed 20:00.000 of 80:00.000 · 12.0× speed/);
    await page.screenshot({ path: '.test-data/import-progress.png' });
    await page.clock.fastForward(16000);
    await panel.getByText(/No measurable progress for/).waitFor();
    assert.equal(await panel.getByText(/left in this step/).count(), 0);
    await send({ label: 'Reading the audio waveform', detail: 'Step 2 of 3', percent: 50, processedSeconds: 2400, totalSeconds: 4800 });
    await panel.getByText('50.0%', { exact: true }).waitFor();
    assert.equal(await panel.getByText(/No measurable progress/).count(), 0);
    await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
    await panel.waitFor({ state: 'hidden' });
    await page.getByText('Operation cancelled.', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log('Progress UI verified: indeterminate startup, percentage, processed time, speed, elapsed/estimated time, no-progress notice, phase transition, cancellation.');
  } finally {
    await app.evaluate(({ app }) => app.exit(0));
    await app.close().catch(() => {});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
