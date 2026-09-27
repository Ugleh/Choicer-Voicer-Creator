import React, {useEffect, useRef, useState} from 'react';
import {Upload, WandSparkles, Volume2, Play, Trash2} from 'lucide-react';
import {formatTime} from './time.mjs';
import {moveTimelineClip,resizeTimelineEdge} from './timeline-drag.mjs';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const round=n=>Math.round(n*1000)/1000;
export function resizeEffect(effect,patch) {
  const next={...effect,...patch},length=next.end-next.start;
  return {...next,fadeIn:Math.min(next.fadeIn,length/2),fadeOut:Math.min(next.fadeOut,length/2)};
}

export function EffectsTrack({scene,start,span,current,selectedId,onSelect,onUpdate,onMenu}) {
  const drag=useRef(null),duration=scene.end-scene.start;
  function begin(event,effect,edge) {
    event.stopPropagation();if(event.button!==0)return;event.preventDefault();
    const width=event.currentTarget.closest('.timeline').getBoundingClientRect().width;
    onSelect(effect.id,true);drag.current={effect,edge,x:event.clientX,width,playhead:current-scene.start};event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event) {
    if(!drag.current||!event.currentTarget.hasPointerCapture(event.pointerId))return;
    event.stopPropagation();const {effect,edge,x,width,playhead}=drag.current,delta=(event.clientX-x)/width*span,tolerance=8/width*span;
    if(Math.abs(event.clientX-x)<3&&!drag.current.moved)return;drag.current.moved=true;
    let patch;
    if(edge==='start') {const a=resizeTimelineEdge(effect.start+delta,Math.max(0,effect.start-effect.offset),effect.end-.01,playhead,tolerance,event.shiftKey);patch={start:a,offset:round(effect.offset+a-effect.start)};}
    else if(edge==='end')patch={end:resizeTimelineEdge(effect.end+delta,effect.start+.01,Math.min(duration,effect.start+effect.duration-effect.offset),playhead,tolerance,event.shiftKey)};
    else patch=moveTimelineClip(effect,delta,duration,playhead,tolerance,event.shiftKey);
    onUpdate(effect.id,resizeEffect(effect,patch),true);
  }
  function stop(event){event.stopPropagation();if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);drag.current=null;}
  return <div className="effects-track" aria-label="Sound Effects timeline">
    {(scene.effects||[]).map((effect,index)=>{
      const left=(scene.start+effect.start-start)/span*100,right=(scene.start+effect.end-start)/span*100;
      if(right<0||left>100)return null;
      return <div key={effect.id} role="button" tabIndex={0} aria-label={`Sound effect: ${effect.name}`} aria-pressed={selectedId===effect.id} data-effect-id={effect.id} className={`effect-clip ${selectedId===effect.id?'selected':''} ${effect.muted?'muted-effect':''}`} style={{left:`${Math.max(0,left)}%`,width:`${Math.max(.4,Math.min(100,right)-Math.max(0,left))}%`,top:6+(index%3)*27,zIndex:selectedId===effect.id?9:4}} title={`${effect.name} · ${formatTime(effect.start)}–${formatTime(effect.end)} · Drag to move`} onContextMenu={e=>{e.preventDefault();e.stopPropagation();onMenu?.(e,effect.id);}} onPointerDown={e=>begin(e,effect)} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();onSelect(effect.id);}}}>
        {selectedId===effect.id&&['start','end'].map(edge=><button key={edge} aria-label={`Resize sound effect ${edge}`} className={`clip-handle ${edge}`} onPointerDown={e=>begin(e,effect,edge)} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}/>)}
        <span>{effect.muted?'Muted · ':''}{effect.name}</span>
      </div>;
    })}
    {!scene.effects?.length&&<span className="track-placeholder">Import or generate sound effects below</span>}
  </div>;
}

export function EffectsPlayback({scene,videoRef,playing,enabled,onError}) {
  const nodes=useRef(new Map()),sceneRef=useRef(scene);sceneRef.current=scene;
  useEffect(()=>{
    let frame;
    const sync=()=>{
      const video=videoRef.current,time=(video?.currentTime??0)-(sceneRef.current?.start??0);
      for(const effect of sceneRef.current?.effects||[]) {
        const audio=nodes.current.get(effect.id);if(!audio)continue;
        const active=enabled&&playing&&video&&!video.paused&&!effect.muted&&!effect.missing&&time>=effect.start&&time<effect.end;
        if(!active){audio.pause();continue;}
        const local=time-effect.start,target=effect.offset+local;
        let gain=effect.gain;if(effect.fadeIn)gain*=Math.min(1,local/effect.fadeIn);if(effect.fadeOut)gain*=Math.min(1,(effect.end-time)/effect.fadeOut);
        audio.volume=clamp(gain,0,1);
        if(audio.paused||Math.abs(audio.currentTime-target)>.06)audio.currentTime=target;
        if(audio.paused)audio.play().catch(()=>{});
      }
      if(playing&&enabled)frame=requestAnimationFrame(sync);
    };
    sync();return()=>{cancelAnimationFrame(frame);for(const audio of nodes.current.values())audio.pause();};
  },[scene?.id,videoRef,playing,enabled]);
  return <>{(scene?.effects||[]).filter(e=>e.url&&!e.missing).map(effect=><audio key={effect.id} data-sound-effect={effect.id} ref={node=>{if(node)nodes.current.set(effect.id,node);else nodes.current.delete(effect.id);}} src={effect.url} preload="auto" onError={()=>onError(`Could not load sound effect: ${effect.name}. Reimport or remove it.`)}/>)}</>;
}

export default function SoundEffects({scene,selectedId,onSelect,onUpdate,onImport,onGenerate,onRemove,onPlay,onCopy,onCut,onPaste,effectMenu,onOpenMenu,onCloseMenu,busy,TimeInput}) {
  const [collapsed,setCollapsed]=useState(false);
  useEffect(()=>setCollapsed(false),[scene.id,selectedId]);
  useEffect(()=>{if(!effectMenu)return;const close=event=>{if(!event.target.closest('.effect-menu'))onCloseMenu?.();};window.addEventListener('pointerdown',close);return()=>window.removeEventListener('pointerdown',close);},[effectMenu,onCloseMenu]);
  const effects=scene.effects||[],effect=effects.find(e=>e.id===selectedId),duration=scene.end-scene.start,volumeDrag=useRef(false);
  const update=(patch,coalesce=false)=>onUpdate(effect.id,resizeEffect(effect,patch),coalesce);
  const menuEffect=effects.find(e=>e.id===effectMenu?.id);
  return <section className={`sound-effects-panel ${!effects.length||collapsed?'compact-effects':''}`} aria-label="Sound Effects">
    <div className="section-toolbar"><div className="row"><Volume2 size={17}/><strong>Sound Effects</strong><span className="count">{effects.length}</span>{effects.length>0&&<button className="text-button" aria-expanded={!collapsed} onClick={()=>setCollapsed(value=>!value)}>{collapsed?'Expand sound effects':'Collapse sound effects'}</button>}</div><div className="row"><button className="button" disabled={busy||effects.length>=200} onClick={onImport}><Upload size={15}/> Import sound effect</button><button className="button" disabled={busy||effects.length>=200} onClick={onGenerate}><WandSparkles size={15}/> Generate with ElevenLabs</button></div></div>
    {effects.length>0&&!collapsed&&<><p className="effects-help">Drag clips on the Sound Effects track to move them; select one to trim its edges. Effects play over the scene and are mixed into the exported backing WAV.</p>
    <div className="effects-content"><div className="effects-list">{effects.map(e=><button className={`effect-row ${e.id===selectedId?'active':''}`} key={e.id} aria-pressed={e.id===selectedId} onContextMenu={event=>{event.preventDefault();onOpenMenu?.(event,e.id);}} onClick={()=>onSelect(e.id)}><span>{e.name}{e.missing&&<small>File missing</small>}</span><span>{formatTime(e.start)} · {(e.end-e.start).toFixed(2)}s{e.muted?' · muted':''}</span></button>)}{!effects.length&&<p className="muted">Add audio from your computer, or describe a sound for ElevenLabs to generate. Importing audio needs no API key.</p>}</div>
    {effect&&<div className="effect-editor"><label className="field"><span>Effect name</span><input aria-label="Effect name" value={effect.name} onChange={e=>update({name:e.target.value})}/></label>
      {effect.missing&&<p className="amber">This audio file is missing. Import a replacement, or mute/remove this clip before exporting.</p>}
      <div className="two-cols"><label className="field"><span>Start · scene time</span><TimeInput label="Effect start time" value={effect.start} max={duration-(effect.end-effect.start)} onChange={start=>update({start,end:round(start+effect.end-effect.start)})}/></label><label className="field"><span>End · scene time</span><TimeInput label="Effect end time" value={effect.end} min={effect.start+.01} max={Math.min(duration,effect.start+effect.duration-effect.offset)} onChange={end=>update({end})}/></label></div>
      <label className="field"><span>Source in · audio time</span><TimeInput label="Effect source in time" value={effect.offset} max={effect.duration-(effect.end-effect.start)} onChange={offset=>update({offset})}/></label>
      <label className="field"><span>Volume · {Math.round(effect.gain*100)}%</span><input aria-label="Effect volume" type="range" min="0" max="100" value={Math.round(effect.gain*100)} onPointerDown={()=>volumeDrag.current=true} onPointerUp={()=>volumeDrag.current=false} onLostPointerCapture={()=>volumeDrag.current=false} onChange={e=>update({gain:+e.target.value/100},volumeDrag.current)}/></label>
      <div className="two-cols">{['fadeIn','fadeOut'].map(key=><label className="field" key={key}><span>{key==='fadeIn'?'Fade in':'Fade out'} · seconds</span><input aria-label={key==='fadeIn'?'Effect fade in':'Effect fade out'} type="number" min="0" max={(effect.end-effect.start)/2} step="0.01" value={effect[key]} onChange={e=>update({[key]:clamp(+e.target.value||0,0,(effect.end-effect.start)/2)})}/></label>)}</div>
      <label className="checkbox"><input type="checkbox" checked={!!effect.muted} onChange={e=>update({muted:e.target.checked})}/> Mute effect in preview and export</label>
      <div className="row"><button className="button" disabled={effect.missing||effect.muted} onClick={()=>onPlay(effect.start,effect.end)}><Play size={15}/> Play in scene</button><button className="button" onClick={()=>onRemove(effect.id)}><Trash2 size={15}/> Remove effect</button></div>
    </div>}</div></>}
    {effectMenu&&menuEffect&&<div className="effect-menu" role="menu" style={{left:Math.min(effectMenu.x,window.innerWidth-200),top:Math.min(effectMenu.y,window.innerHeight-175)}} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();onCloseMenu?.();}}}><strong>{menuEffect.name}</strong><button role="menuitem" onClick={()=>{onCopy(menuEffect.id);onCloseMenu?.();}}>Copy effect</button><button role="menuitem" onClick={()=>{onCut(menuEffect.id);onCloseMenu?.();}}>Cut effect</button><button role="menuitem" onClick={()=>{onPaste();onCloseMenu?.();}}>Paste effect</button><button role="menuitem" className="delete-effect" onClick={()=>{onRemove(menuEffect.id);onCloseMenu?.();}}>Delete effect</button></div>}
  </section>;
}
