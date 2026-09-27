export const orderedLines = clips => [...clips].sort((a,b) => a.start-b.start);

export function selectDialogue(clips,ids,target,anchor,{additive=false,range=false}={}) {
  const ordered=orderedLines(clips).map(c=>c.id),valid=new Set(ordered);
  if(!valid.has(target))return {ids,anchor};
  if(range){
    const from=valid.has(anchor)?anchor:ids.filter(id=>valid.has(id)).at(-1)||target;
    const a=ordered.indexOf(from),b=ordered.indexOf(target),between=ordered.slice(Math.min(a,b),Math.max(a,b)+1);
    const result=[...new Set([...(additive?ids.filter(id=>valid.has(id)):[]),...between])];
    return {ids:[...result.filter(id=>id!==target),target],anchor:from};
  }
  return {ids:additive?(ids.includes(target)?ids.filter(id=>id!==target):[...ids,target]):[target],anchor:target};
}

export function renameCharacters(scenes,renames,sceneId=null){
  const names=new Map(renames.map(([from,to])=>[from,to.trim()]));
  if([...names.values()].some(name=>!name))throw new Error('Enter a name for every character.');
  return scenes.map(scene=>sceneId!==null&&scene.id!==sceneId?scene:{...scene,clips:scene.clips.map(clip=>names.has(clip.character)?{...clip,character:names.get(clip.character)}:clip)});
}

export function selectedLines(clips, ids) {
  const selected = new Set(ids);
  return orderedLines(clips.filter(clip => selected.has(clip.id)));
}

export function sharedCharacter(clips) {
  return clips.length && clips.every(clip => clip.character === clips[0].character) ? clips[0].character : null;
}

export function assignCharacter(clips, ids, character) {
  const selected = new Set(ids), name = character.trim();
  if (!name) throw new Error('Enter a character name.');
  return clips.map(clip => selected.has(clip.id) ? {...clip,character:name} : clip);
}

export function duplicateLines(clips, ids, makeId) {
  const selected = new Set(ids), copies = [];
  if (clips.length + clips.filter(clip => selected.has(clip.id)).length > 10000) throw new Error('A scene can contain up to 10,000 dialogue lines.');
  const result = clips.flatMap(clip => {
    if (!selected.has(clip.id)) return [clip];
    const copy = {...clip, id: makeId()};
    copies.push(copy);
    return [clip, copy];
  });
  return {clips: orderedLines(result), copies: orderedLines(copies)};
}

export function mergeLines(clips, ids) {
  const selected = selectedLines(clips, ids);
  if (selected.length < 2) throw new Error('Select at least two lines to merge.');
  if (sharedCharacter(selected) === null) throw new Error('Assign one character to the selected lines before merging.');
  const start = Math.min(...selected.map(clip => clip.start)), end = Math.max(...selected.map(clip => clip.end));
  if (end-start >= 60) throw new Error('The merged line must be shorter than 60 seconds.');
  const merged = {...selected[0],start,end,caption:selected.map(clip => clip.caption.trim()).filter(Boolean).join(' ')};
  const remove = new Set(selected.map(clip => clip.id));
  return {merged,clips:orderedLines([...clips.filter(clip => !remove.has(clip.id)),merged])};
}
