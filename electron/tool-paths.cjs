// Windows Explorer and rich-text copy/paste can include direction markers or
// wrapping quotes. spawn() expects the executable path itself, without either.
function normalizeExecutablePath(value) {
  if (typeof value !== 'string') return '';
  let result = value.replace(/[\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '').trim();
  const quotes = { '"': '"', "'": "'", '\u201c': '\u201d' };
  while (result.length >= 2 && quotes[result[0]] === result.at(-1)) {
    result = result.slice(1, -1).trim();
  }
  return result;
}

function normalizeToolSettings(settings) {
  const result = { ...settings };
  for (const key of ['ffmpegPath', 'ffprobePath']) {
    if (typeof result[key] === 'string') result[key] = normalizeExecutablePath(result[key]);
  }
  return result;
}

module.exports = { normalizeExecutablePath, normalizeToolSettings };
