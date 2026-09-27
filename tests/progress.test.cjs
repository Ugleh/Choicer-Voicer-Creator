const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ffmpegProgress } = require('../electron/progress.cjs');
const { MediaEngine } = require('../electron/media.cjs');

test('progress survives split pipe chunks and produces speed and a time estimate', () => {
  const updates = [], read = ffmpegProgress({ duration: 100, label: 'Preview', emit: p => updates.push(p) });
  read(Buffer.from('out_time_u'));
  read(Buffer.from('s=25000000\r\nspeed=2.5x\r\nprogr'));
  assert.equal(updates.length, 0);
  read(Buffer.from('ess=continue\r\n'));
  assert.equal(updates[0].percent, 25);
  assert.equal(updates[0].processedSeconds, 25);
  assert.equal(updates[0].remainingSeconds, 30);
  assert.equal(updates[0].speed, 2.5);
});

test('missing and N/A fields never yield NaN or a made-up time estimate', () => {
  const updates = [], read = ffmpegProgress({ duration: 100, label: 'Preview', emit: p => updates.push(p) });
  read(Buffer.from('out_time_us=N/A\nspeed=N/A\nprogress=continue\n'));
  assert.equal(updates[0].percent, null);
  assert.equal(updates[0].remainingSeconds, null);
  read(Buffer.from('out_time_us=4000000\nspeed=0x\nprogress=continue\nprogress=continue\n'));
  assert.equal(updates.at(-1).percent, 4);
  assert.equal(updates.at(-1).remainingSeconds, null);
});

test('timestamps cannot move the bar backwards or finish it before the process exits', () => {
  const updates = [], read = ffmpegProgress({ duration: 10, label: 'Preview', emit: p => updates.push(p) });
  for (const us of [-1000, 4000000, 3000000, 11000000]) read(Buffer.from(`out_time_us=${us}\nspeed=2x\nprogress=continue\n`));
  assert.deepEqual(updates.map(p => p.percent), [0, 40, 40, 99.9]);
  assert.equal(updates.at(-1).processedSeconds, 10);
});

test('the media engine forwards process progress and preserves startup detail', async () => {
  const updates = [];
  const engine = new MediaEngine('', () => ({ ffmpegPath: process.execPath }), p => updates.push(p));
  await engine.run('ffmpeg', ['-e', 'process.stdout.write("out_time_us=5000000\\nspeed=2x\\nprogress=end\\n")'], { duration: 10, label: 'Preview', detail: 'Full movie' });
  assert.equal(updates[0].percent, null);
  assert.equal(updates.at(-1).percent, 50);
  assert.equal(updates.at(-1).detail, 'Full movie');
});
