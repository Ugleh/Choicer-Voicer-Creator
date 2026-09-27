const finite = Number.isFinite;
export const effectLength = effect => effect.end - effect.start;
export function effectError(effect, sceneDuration) {
  if (!effect || typeof effect.id !== 'string' || typeof effect.name !== 'string' || typeof effect.path !== 'string') return 'Invalid sound effect.';
  if (![effect.start, effect.end, effect.offset, effect.duration, effect.gain, effect.fadeIn, effect.fadeOut].every(finite)) return 'Sound effect timing and volume must be numbers.';
  if (effect.start < 0 || effect.end <= effect.start || effect.end > sceneDuration + .001 || effect.offset < 0 || effect.offset + effectLength(effect) > effect.duration + .001) return `${effect.name}: sound effect must fit within the scene and its source audio.`;
  if (effect.gain < 0 || effect.gain > 1 || effect.fadeIn < 0 || effect.fadeOut < 0 || effect.fadeIn + effect.fadeOut > effectLength(effect) + .001) return `${effect.name}: invalid volume or fades.`;
  return null;
}
export function trimEffects(effects = [], offset, duration) {
  const round = n => Math.round(n * 1000) / 1000;
  return effects.flatMap(effect => {
    const a = Math.max(offset, effect.start), b = Math.min(offset + duration, effect.end);
    if (b <= a) return [];
    const length = round(b - a), fadeIn = Math.min(effect.fadeIn, length / 2), fadeOut = Math.min(effect.fadeOut, length / 2);
    return [{ ...effect, start: round(a - offset), end: round(b - offset), offset: round(effect.offset + a - effect.start), fadeIn, fadeOut }];
  });
}
export function validateSeparationRange(scene, range) {
  if (!range || ![range.start, range.end].every(finite) || range.start < 0 || range.end > scene.end - scene.start || range.end - range.start < .1 || range.end - range.start > 600) throw new Error('Select between 0.1 seconds and 10 minutes inside this scene.');
  if (!['backing', 'original'].includes(range.source)) throw new Error('Choose original audio or the existing backing track.');
  if (!scene.backing?.path || scene.backingMissing || scene.backing.sourceStart !== scene.start || scene.backing.sourceEnd !== scene.end) throw new Error('Import or generate a matching backing track before repairing a range.');
  return range;
}
