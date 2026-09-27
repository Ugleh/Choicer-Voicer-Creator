// FFmpeg emits key=value records terminated by progress=continue/end. Buffer
// across pipe chunks and ignore N/A values instead of sending NaN to the UI.
function ffmpegProgress({ duration, label, detail, emit }) {
  let partial = '', record = {}, processedSeconds = null;
  return chunk => {
    partial += chunk.toString();
    const lines = partial.split('\n');
    partial = lines.pop();
    for (const raw of lines) {
      const line = raw.trim(), separator = line.indexOf('=');
      if (separator < 0) continue;
      const key = line.slice(0, separator), value = line.slice(separator + 1);
      record[key] = value;
      if (key !== 'progress') continue;
      const seconds = Number(record.out_time_us) / 1e6;
      if (Number.isFinite(seconds)) processedSeconds = Math.max(processedSeconds || 0, Math.min(duration, seconds));
      const speed = Number((record.speed || '').replace(/x$/, ''));
      emit({
        label, detail, processedSeconds, totalSeconds: duration,
        percent: processedSeconds === null ? null : Math.min(99.9, processedSeconds / duration * 100),
        speed: Number.isFinite(speed) && speed > 0 ? speed : null,
        remainingSeconds: processedSeconds > 0 && Number.isFinite(speed) && speed > 0
          ? Math.max(0, (duration - processedSeconds) / speed) : null,
      });
      record = {};
    }
  };
}

module.exports = { ffmpegProgress };
