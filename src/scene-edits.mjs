import {moveTimelineClip} from './timeline-drag.mjs';
const round=n=>Math.round(n*1000)/1000;

export function moveDialogueGroup(lines,delta,duration,playhead,tolerance,bypass){
  const start=Math.min(...lines.map(c=>c.start)),end=Math.max(...lines.map(c=>c.end));
  const moved=moveTimelineClip({start,end},delta,duration,playhead,tolerance,bypass),shift=moved.start-start;
  return lines.map(line=>({...line,start:round(line.start+shift),end:round(line.end+shift)}));
}

export function pasteElements(clipboard,at,duration,uid){
  if(!clipboard?.items?.length)return [];
  const origin=Math.min(...clipboard.items.map(c=>c.start)),end=Math.max(...clipboard.items.map(c=>c.end));
  const start=round(Math.max(0,at));
  if(start+end-origin>duration+.0005)throw Error('The selection does not fit at the playhead.');
  return clipboard.items.map(item=>({...structuredClone(item),id:uid(),start:round(start+item.start-origin),end:round(start+item.end-origin)}));
}

export function reorderScenes(scenes,id,targetId,after=false){
  if(id===targetId||!scenes.some(s=>s.id===id)||!scenes.some(s=>s.id===targetId))return scenes;
  const next=scenes.filter(s=>s.id!==id),index=next.findIndex(s=>s.id===targetId);
  next.splice(index+(after?1:0),0,scenes.find(s=>s.id===id));
  return next.every((s,i)=>s===scenes[i])?scenes:next;
}
