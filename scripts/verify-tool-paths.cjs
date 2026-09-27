const { _electron: electron } = require('playwright');
const path = require('node:path');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');

(async () => {
  const [ffmpegPath, ffprobePath, movie] = process.argv.slice(2);
  if (!ffmpegPath || !ffprobePath) throw new Error('Provide the FFmpeg and FFprobe executable paths, followed by an optional video path.');
  const data = path.resolve('.test-data', 'tool-path-regression-' + Date.now());
  await fs.mkdir(data, { recursive: true });
  const file = path.join(data, 'settings.json');
  await fs.writeFile(file, JSON.stringify({
    ffmpegPath: '\u202a' + ffmpegPath,
    ffprobePath: `\u202a"${ffprobePath}"\u202c`,
    transcribeRate: 0.1, separateRate: null,
  }));
  const app = await electron.launch({
    executablePath: path.resolve('release', 'v' + require('../package.json').version, 'win-unpacked/Choicer Voicer Creator.exe'),
    args: [], env: { ...process.env, CV_TEST_DATA: data },
  });
  try {
    const page = await app.firstWindow();
    await page.getByText('Make a scene worth repeating.').waitFor();
    const boot = await page.evaluate(() => window.creator.bootstrap());
    assert.equal(boot.toolStatus.ok, true, boot.toolStatus.error);
    assert.equal(boot.settings.ffmpegPath, ffmpegPath);
    assert.equal(boot.settings.ffprobePath, ffprobePath);
    let stored = JSON.parse(await fs.readFile(file, 'utf8'));
    assert.equal(stored.ffprobePath, ffprobePath);
    assert.equal(stored.transcribeRate, 0.1);

    // Verify settings entered after startup use the same cleanup before saving.
    const changed = await page.evaluate(settings => window.creator.saveSettings(settings), {
      ...boot.settings,
      ffmpegPath: `\u2066"${ffmpegPath}"\u2069`,
      ffprobePath: ` \u202a"${ffprobePath}" `,
      transcribeRate: 0.1, separateRate: null,
    });
    assert.equal(changed.ffprobePath, ffprobePath);
    stored = JSON.parse(await fs.readFile(file, 'utf8'));
    assert.equal(stored.ffmpegPath, ffmpegPath);
    assert.equal(stored.ffprobePath, ffprobePath);

    if (movie) {
      await app.evaluate(({ dialog }, file) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
      }, path.resolve(movie));
      const info = await page.evaluate(() => window.creator.importVideo());
      assert.ok(info.duration > 0);
      assert.ok(info.width > 0);
      assert.ok(info.audio.length > 0);
      console.log(`Provided video probed through packaged IPC: ${info.width}x${info.height}, ${info.duration.toFixed(3)} seconds, ${info.audio.length} audio track(s).`);
    }
    console.log('Packaged path regression passed: migrated settings, saved paths, process startup, and media probing.');
  } finally {
    await app.evaluate(({ app }) => app.exit(0));
    await app.close().catch(() => {});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
