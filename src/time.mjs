export function formatTime(seconds = 0) {
  const ms = Math.round(Math.max(0, seconds) * 1000);
  return `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}

export function parseTime(value) {
  const text = value.trim();
  if (/^\d+(?:\.\d{1,3})?$/.test(text)) return Number(text);
  const match = /^(\d+):([0-5]\d)(?:\.(\d{1,3}))?$/.exec(text);
  return match ? Number(match[1]) * 60 + Number(match[2]) + Number((match[3] || '').padEnd(3, '0')) / 1000 : null;
}
