const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const milliseconds = value => Math.round(value * 1000) / 1000;

export function moveBoundary(range, edge, value, locks, min, max, extend = false) {
  if (locks[edge] || !Number.isFinite(value)) return range;
  const next = [...range], at = clamp(milliseconds(value), min, max);
  // Marking a new range may extend its other endpoint, but never a locked one.
  if (extend && !locks[1 - edge]) next[1 - edge] = edge === 0 ? Math.max(at, next[1]) : Math.min(at, next[0]);
  next[edge] = edge === 0 ? clamp(at, min, next[1]) : clamp(at, next[0], max);
  return next;
}

export function dragRange(range, anchor, at, locks, min, max) {
  if (locks[0]) return moveBoundary(range, 1, at, locks, min, max);
  if (locks[1]) return moveBoundary(range, 0, at, locks, min, max);
  return [clamp(milliseconds(Math.min(anchor, at)), min, max), clamp(milliseconds(Math.max(anchor, at)), min, max)];
}
