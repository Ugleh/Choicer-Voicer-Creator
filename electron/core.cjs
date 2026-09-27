const crypto = require('node:crypto');
const {lineRange}=require('../shared/line-range.mjs');
const {effectError}=require('../shared/sound-effects.mjs');
const id = () => crypto.randomUUID();
const finite = n => typeof n === 'number' && Number.isFinite(n);
const round = n => Math.round(n * 1000) / 1000;
function safeName(value, fallback = 'Untitled') {
  let result = String(value || '').normalize('NFKC').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim().replace(/[. ]+$/g, '').slice(0, 90);
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(result)) result = '_' + result;
  return result || fallback;
}
function clipName(clip, index) {
  return `${String(index + 1).padStart(2, '0')}_${safeName(clip.caption || clip.character, 'Line').replace(/\s+/g, '').slice(0, 45)}`;
}
const quote = value => JSON.stringify(String(value ?? ''));
function clipIni(clip) {
  return `[data]\r\n\r\ncaption=${quote(clip.caption)}\r\ndub_timestamps=[${clip.start.toFixed(3)}]\r\ndub_characters=[${quote(clip.character)}]\r\n`;
}
function packIni(project, scene, title = `${collectionTitle(project)} - ${scene.name}`) {
  return `[data]\r\n\r\ntitle=${quote(title)}\r\nauthors=[${quote(project.author)}]\r\nsubtitle=${quote(scene.description || '')}\r\nreadme=${quote(project.description || '')}\r\n`;
}
const collectionTitle = project => project.packTitle?.trim() || project.name;
const packName = (project, scene) => safeName(`${collectionTitle(project)} - ${scene.name}`);
function validateScene(scene, media, requireBacking = false) {
  const errors = [], warnings = [];
  if (!scene || !media) return { errors: ['Import a video and add a scene first.'], warnings };
  const duration = scene.end - scene.start;
  if (!scene.name?.trim()) errors.push('Give the scene a name.');
  if (!finite(scene.start) || !finite(scene.end) || scene.start < 0 || duration <= 0 || scene.end > media.duration + 0.01) errors.push('Scene boundaries must fall within the source video.');
  if (!Array.isArray(scene.clips) || !scene.clips.length) errors.push('Add at least one dialogue clip.');
  if(scene.backingMissing)errors.push('The saved backing track is missing. Import it again or choose a silent background.');
  if (requireBacking && !scene.backing?.path) errors.push('Create or import a backing track.');
  if (scene.backing?.path && !scene.backing.reviewed) errors.push('Listen to the backing track and mark it reviewed.');
  if (!scene.backing?.path) warnings.push((scene.effects||[]).some(e=>!e.muted)?'No backing track: only sound effects play in the exported background.':'No backing track: the exported background is silent. Dialogue samples may contain original background audio.');
  for(const effect of scene.effects||[]){const error=effectError(effect,duration);if(error)errors.push(error);if(effect.missing&&!effect.muted)errors.push(`${effect.name}: sound effect file is missing. Reimport, mute, or remove it.`);}
  if (scene.linePadding!==undefined&&(!finite(scene.linePadding)||scene.linePadding<0||scene.linePadding>5)) errors.push('Line padding must be between 0 and 5 seconds.');
  if (scene.backing?.path && (Math.abs(scene.backing.duration - duration) > 0.15 || scene.backing.sourceStart !== scene.start || scene.backing.sourceEnd !== scene.end || scene.backing.audioIndex !== media.audioIndex)) errors.push('The backing track no longer matches the scene. Generate or import it again.');
  const ordered = [...(scene.clips || [])].sort((a,b) => a.start-b.start);
  ordered.forEach((clip, i) => {
    const label = `Line ${i + 1}`;
    if (!finite(clip.start) || !finite(clip.end) || clip.start < 0 || clip.end <= clip.start || clip.end > duration + 0.005) errors.push(`${label}: boundaries must fall within the scene.`);
    if (clip.end - clip.start >= 60) errors.push(`${label}: clips must be shorter than 60 seconds.`);
    else if (lineRange(scene,clip).end-lineRange(scene,clip).start>=60) errors.push(`${label}: the clip including padding must be shorter than 60 seconds. Reduce padding or shorten the line.`);
    else if (clip.end - clip.start > 6) warnings.push(`${label}: shorter than six seconds is recommended.`);
    if (!clip.caption?.trim()) errors.push(`${label}: add a caption.`);
    if (!clip.character?.trim()) errors.push(`${label}: assign a character.`);
    if (i && clip.start < ordered[i-1].end) warnings.push(`${label}: overlaps the previous line; review the timing.`);
  });
  return { errors, warnings };
}
function validateProject(project) {
  if (!project || project.version !== 1 || typeof project.name !== 'string' || !Array.isArray(project.scenes) || project.scenes.length > 500) throw new Error('This is not a supported Creator project.');
  if (project.packTitle !== undefined && typeof project.packTitle !== 'string') throw new Error('Invalid pack title in project.');
  if(project.shareDetails!==undefined){const value=project.shareDetails;if(!value||typeof value!=='object'||Array.isArray(value)||['intro','downloadUrl'].some(key=>value[key]!==undefined&&(typeof value[key]!=='string'||value[key].length>(key==='intro'?6000:2048))))throw new Error('Invalid sharing details in project.');}
  if (project.media && (typeof project.media.path !== 'string' || !finite(project.media.duration) || project.media.duration <= 0 || !Number.isInteger(project.media.audioIndex))) throw new Error('Invalid source media in project.');
  const seen = new Set();
  for (const scene of project.scenes) {
    if (typeof scene.id !== 'string' || seen.has(scene.id) || typeof scene.name !== 'string' || !finite(scene.start) || !finite(scene.end) || !Array.isArray(scene.clips) || scene.clips.length > 10000) throw new Error('Invalid scene in project.');
    seen.add(scene.id);
    if(scene.effects!==undefined&&(!Array.isArray(scene.effects)||scene.effects.length>200))throw new Error('A scene supports up to 200 sound effects.');
    const effectIds=new Set();for(const effect of scene.effects||[]){const error=effectError(effect,scene.end-scene.start);if(error||effectIds.has(effect.id))throw new Error(error||'Duplicate sound effect identity.');effectIds.add(effect.id);}
    if(scene.linePadding!==undefined&&(!finite(scene.linePadding)||scene.linePadding<0||scene.linePadding>5))throw new Error('Invalid dialogue padding in project.');
    for (const clip of scene.clips) if (typeof clip.id !== 'string' || !finite(clip.start) || !finite(clip.end) || typeof clip.caption !== 'string' || typeof clip.character !== 'string') throw new Error('Invalid dialogue clip in project.');
  }
  return project;
}
function transcriptToClips(result, duration) {
  const words = (result.words || []).filter(w => w.type === 'word' && finite(w.start) && finite(w.end) && w.end > w.start && w.start < duration).sort((a,b) => a.start-b.start);
  const groups = [];
  let group = [];
  function flush() {
    if (!group.length) return;
    groups.push({ id: id(), start: round(Math.max(0, group[0].start)), end: round(Math.min(duration, group.at(-1).end)), caption: group.map(w=>w.text.trim()).join(' ').replace(/\s+([,.!?;:])/g,'$1'), character: group[0].speaker_id ? `Speaker ${String(group[0].speaker_id).replace(/^speaker_/, '')}` : 'Speaker 1' });
    group = [];
  }
  for (const word of words) {
    if (group.length && (word.speaker_id !== group[0].speaker_id || word.start - group.at(-1).end > 0.65 || word.end - group[0].start > 5.8 || /[.!?]["”']?$/.test(group.at(-1).text))) flush();
    group.push(word);
  }
  flush();
  return groups.filter(c => c.end > c.start);
}
module.exports = { id, round, safeName, clipName, clipIni, packIni, packName, collectionTitle, validateScene, validateProject, transcriptToClips };
