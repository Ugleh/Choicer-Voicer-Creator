const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeExecutablePath, normalizeToolSettings } = require('../electron/tool-paths.cjs');
const { MediaEngine } = require('../electron/media.cjs');

test('copied Windows executable paths shed invisible direction markers and quotes', () => {
  const expected = 'C:\\ffmpeg\\bin\\ffprobe.exe';
  for (const copied of [
    '\u202a' + expected,
    ` \u202a"${expected}"\u202c `,
    `\u2066\u201c${expected}\u201d\u2069`,
    `\ufeff'${expected}'\u200e`,
    `\u200b${expected}\u200f`,
  ]) assert.equal(normalizeExecutablePath(copied), expected);
});

test('normalization preserves real spaces, Unicode, UNC paths and shell metacharacters', () => {
  for (const value of ['C:\\Tools & Media\\ffprobe.exe', 'C:\\工具\\ffprobe.exe', '\\\\server\\Media Tools\\ffprobe.exe']) {
    assert.equal(normalizeExecutablePath(`"${value}"`), value);
  }
  assert.equal(normalizeExecutablePath(' \u202a\u202c '), '');
  assert.equal(normalizeExecutablePath(undefined), '');
});

test('migration changes only the tool paths, preserving encrypted credentials and rates', () => {
  const original = { ffprobePath: '\u202aC:\\ffmpeg\\bin\\ffprobe.exe', ffmpegPath: '"C:\\ffmpeg\\bin\\ffmpeg.exe"', encryptedKey: 'opaque-test-value', transcribeRate: 0.1 };
  const cleaned = normalizeToolSettings(original);
  assert.equal(cleaned.ffprobePath, 'C:\\ffmpeg\\bin\\ffprobe.exe');
  assert.equal(cleaned.ffmpegPath, 'C:\\ffmpeg\\bin\\ffmpeg.exe');
  assert.equal(cleaned.encryptedKey, original.encryptedKey);
  assert.equal(cleaned.transcribeRate, original.transcribeRate);
  assert.ok(original.ffprobePath.startsWith('\u202a'));
});

test('process launch works with the reported invisible prefix and a quoted path', async () => {
  const engine = new MediaEngine('', () => ({ ffprobePath: `\u202a"${process.execPath}"\u202c ` }));
  assert.equal(await engine.run('ffprobe', ['-e', 'process.stdout.write("probe-started")']), 'probe-started');
  const defaultEngine = new MediaEngine('', () => ({ ffprobePath: ' \u202a ' }));
  assert.equal(defaultEngine.binary('ffprobe'), 'ffprobe');
});

test('a genuinely missing executable reports the attempted path clearly', async () => {
  const engine = new MediaEngine('', () => ({ ffprobePath: 'C:\\missing-creator-tool-17605\\ffprobe.exe' }));
  await assert.rejects(engine.run('ffprobe', ['-version']), /ffprobe was not found: .*missing-creator-tool-17605/);
});
