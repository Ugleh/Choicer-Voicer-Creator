const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { effectError, validateSeparationRange } = require('../shared/sound-effects.mjs');
const samples = seconds => Math.round(seconds * 48000);

async function importEffect(engine, input, directory) {
  const info = await engine.probe(input);
  if (!info.audio.length || info.duration > 600) throw new Error('Choose an audio clip up to 10 minutes long.');
  await fs.mkdir(directory, { recursive: true });
  const output = path.join(directory, 'effect.wav');
  await engine.ff(['-i', input, '-map', '0:a:0', '-vn', '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', output], { duration: info.duration, label: 'Preparing sound effect' });
  const written = await engine.probe(output);
  return { id: randomUUID(), name: path.basename(input, path.extname(input)), path: output, duration: written.duration, offset: 0, gain: 1, fadeIn: 0, fadeOut: 0, muted: false };
}

async function mixBacking(engine, scene, output, outputDuration = scene.end - scene.start) {
  const duration = scene.end - scene.start;
  for (const effect of scene.effects || []) {
    const error = effectError(effect, duration);
    if (error) throw new Error(error);
    if (!effect.muted && effect.missing) throw new Error(`${effect.name}: sound effect file is missing. Reimport, mute, or remove it.`);
  }
  const effects = (scene.effects || []).filter(e => !e.muted && e.gain > 0);
  const args = scene.backing?.path ? ['-i', scene.backing.path] : ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'];
  if (scene.backing?.path && Math.abs((await engine.probe(scene.backing.path)).duration - duration) > .15) throw new Error('Backing audio length does not match scene.');
  const count = samples(outputDuration);
  const filters = [`[0:a:0]aresample=48000,aformat=channel_layouts=stereo,atrim=end_sample=${samples(duration)},asetpts=N/SR/TB,apad=whole_len=${count},atrim=end_sample=${count}[base]`];
  for (const [index, effect] of effects.entries()) {
    args.push('-i', effect.path);
    const length = effect.end - effect.start;
    const chain = [`aresample=48000`, 'aformat=channel_layouts=stereo', `atrim=start_sample=${samples(effect.offset)}:end_sample=${samples(effect.offset + length)}`, 'asetpts=N/SR/TB', `volume=${effect.gain}`];
    if (effect.fadeIn) chain.push(`afade=t=in:st=0:d=${effect.fadeIn}`);
    if (effect.fadeOut) chain.push(`afade=t=out:st=${length - effect.fadeOut}:d=${effect.fadeOut}`);
    chain.push(`adelay=${samples(effect.start)}S:all=1`);
    filters.push(`[${index + 1}:a:0]${chain.join(',')}[fx${index}]`);
  }
  if (effects.length) filters.push(`[base]${effects.map((_, i) => `[fx${i}]`).join('')}amix=inputs=${effects.length + 1}:duration=first:normalize=0,alimiter=limit=0.98:level=false:latency=true,apad=whole_len=${count},atrim=end_sample=${count}[out]`);
  // Keep effect filters out of Windows' command-line length limit.
  const filterFile=output+'.filters-'+randomUUID()+'.txt';
  await fs.writeFile(filterFile,filters.join(';'));
  try { await engine.ff([...args, '-filter_complex_script', filterFile, '-map', effects.length ? '[out]' : '[base]', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', output], { duration: outputDuration, label: 'Mixing backing and sound effects' }); }
  finally { await fs.rm(filterFile,{force:true}); }
  const info = await engine.probe(output);
  if (Math.abs(info.duration - count / 48000) > .001) throw new Error('Backing mix duration verification failed.');
  return output;
}

async function patchBacking(engine, scene, range, replacement, output) {
  validateSeparationRange(scene, range);
  const duration = scene.end - scene.start, length = range.end - range.start;
  if (Math.abs((await engine.probe(replacement)).duration - length) > .15) throw new Error('The replacement audio does not match the selected range.');
  if (Math.abs((await engine.probe(scene.backing.path)).duration - duration) > .15) throw new Error('The backing track does not match this scene.');
  const start = samples(range.start), end = samples(range.end), count = end - start, total = samples(duration), fade = Math.min(.01, length / 4);
  // Blend only inside the selection. Prefix/suffix keep their exact PCM samples.
  const parts = [], filters = [];
  if (start) { filters.push(`[0:a:0]aresample=48000,aformat=channel_layouts=stereo,atrim=end_sample=${start},asetpts=N/SR/TB[before]`); parts.push('[before]'); }
  filters.push(`[0:a:0]aresample=48000,aformat=channel_layouts=stereo,atrim=start_sample=${start}:end_sample=${end},asetpts=N/SR/TB,asplit=2[oldIn][oldOut]`);
  filters.push(`[oldIn]afade=t=out:st=0:d=${fade}[edgeIn]`, `[oldOut]afade=t=in:st=${length - fade}:d=${fade}[edgeOut]`);
  filters.push(`[1:a:0]aresample=48000,aformat=channel_layouts=stereo,apad=whole_len=${count},atrim=end_sample=${count},asetpts=N/SR/TB,afade=t=in:st=0:d=${fade},afade=t=out:st=${length - fade}:d=${fade}[new]`);
  filters.push('[edgeIn][edgeOut][new]amix=inputs=3:duration=longest:normalize=0[patch]'); parts.push('[patch]');
  if (end < total) { filters.push(`[0:a:0]aresample=48000,aformat=channel_layouts=stereo,atrim=start_sample=${end}:end_sample=${total},asetpts=N/SR/TB[after]`); parts.push('[after]'); }
  filters.push(`${parts.join('')}concat=n=${parts.length}:v=0:a=1,apad=whole_len=${total},atrim=end_sample=${total}[out]`);
  await engine.ff(['-i', scene.backing.path, '-i', replacement, '-filter_complex', filters.join(';'), '-map', '[out]', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', output], { duration, label: 'Replacing selected backing range' });
  const info = await engine.probe(output);
  if (Math.abs(info.duration - total / 48000) > .001) throw new Error('Repaired backing duration verification failed.');
  return { ...scene.backing, path: output, reviewed: false, repairedRange: { ...range }, duration: info.duration };
}
module.exports = { importEffect, mixBacking, patchBacking };
