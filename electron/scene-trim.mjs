const round = n => Math.round(n * 1000) / 1000;

export function planSceneTrim(scene, start, end) {
  if (!scene || ![start, end, scene.start, scene.end].every(Number.isFinite) || start < scene.start || end > scene.end || end - start < .01) {
    throw new Error('Choose at least 0.010 seconds within the current scene.');
  }
  start = round(start); end = round(end);
  const offset = round(start - scene.start), duration = round(end - start);
  let removed = 0, shortened = 0;
  const clips = scene.clips.flatMap(clip => {
    const a = round(Math.max(0, clip.start - offset)), b = round(Math.min(duration, clip.end - offset));
    if (b <= a) { removed++; return []; }
    if (clip.start < offset || clip.end > round(offset + duration)) shortened++;
    return [{ ...clip, start: a, end: b }];
  });
  return { start, end, offset, duration, clips, removed, shortened };
}
