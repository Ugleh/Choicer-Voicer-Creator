import React, {useRef} from 'react';
import {orderedLines} from './dialogue.mjs';
import {moveTimelineClip,resizeTimelineEdge} from './timeline-drag.mjs';
import {moveDialogueGroup} from './scene-edits.mjs';

export default function DialogueTrack({scene,start,span,current,fps,selectedClipIds,onClip,onFocusClip,updateClip,updateGroup,onMenu}) {
  const drag=useRef(null),clips=scene?orderedLines(scene.clips):[];
  function begin(event,clip,edge) {
    event.stopPropagation();if(event.button!==0)return;event.preventDefault();
    const additive=!edge&&(event.ctrlKey||event.metaKey),range=!edge&&event.shiftKey;
    event.currentTarget.closest('.timeline').focus({preventScroll:true});
    const group=!edge&&!additive&&!range&&selectedClipIds.includes(clip.id)?clips.filter(c=>selectedClipIds.includes(c.id)):[clip];
    if(group.length===1||additive||range)onClip(clip.id,additive,range);
    if(additive)return;
    drag.current={clip,group,edge,x:event.clientX,width:event.currentTarget.closest('.timeline').getBoundingClientRect().width,playhead:current-scene.start};
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event) {
    const state=drag.current;if(!state||!event.currentTarget.hasPointerCapture(event.pointerId))return;
    event.stopPropagation();if(Math.abs(event.clientX-state.x)<3&&!state.moved)return;state.moved=true;
    const {clip,edge,x,width,playhead}=state,delta=(event.clientX-x)/width*span,tolerance=8/width*span,duration=scene.end-scene.start;
    if(!edge&&state.group.length>1){updateGroup(moveDialogueGroup(state.group,delta,duration,playhead,tolerance,event.shiftKey));return;}
    const patch=edge?{[edge]:resizeTimelineEdge(clip[edge]+delta,edge==='start'?0:clip.start+.01,edge==='start'?clip.end-.01:duration,playhead,tolerance,event.shiftKey)}:moveTimelineClip(clip,delta,duration,playhead,tolerance,event.shiftKey);
    updateClip(clip.id,patch,true);
  }
  function stop(event){event.stopPropagation();if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);drag.current=null;}
  return <div className="clip-track">{clips.map((clip,i)=>{
    const left=(scene.start+clip.start-start)/span*100,right=(scene.start+clip.end-start)/span*100;if(right<0||left>100)return null;
    return <div key={clip.id} data-clip-id={clip.id} className={`timeline-clip ${selectedClipIds.includes(clip.id)?'selected':''}`} style={{zIndex:selectedClipIds.at(-1)===clip.id?9:selectedClipIds.includes(clip.id)?8:4,left:`${Math.max(0,left)}%`,width:`${Math.max(.3,Math.min(100,right)-Math.max(0,left))}%`}}
      onContextMenu={e=>onMenu(e,clip)} onPointerDown={e=>begin(e,clip)} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} onDoubleClick={e=>{if(!e.target.closest('button')){e.stopPropagation();onFocusClip(clip);}}} title={`${clip.character}: ${clip.caption}`}>
      {selectedClipIds.includes(clip.id)&&['start','end'].map(edge=><button type="button" key={edge} aria-label={`Resize line ${i+1} ${edge}`} className={`clip-handle ${edge}`} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();e.stopPropagation();updateClip(clip.id,{[edge]:resizeTimelineEdge(clip[edge]+(e.key==='ArrowRight'?1:-1)/fps,edge==='start'?0:clip.start+.01,edge==='start'?clip.end-.01:scene.end-scene.start,0,0,true)});}}} onPointerDown={e=>begin(e,clip,edge)} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}/>)}
      <span>{clip.caption||'Untitled line'}</span>
    </div>;
  })}{!clips.length&&<span className="track-placeholder">Your dialogue clips will appear here</span>}</div>;
}
