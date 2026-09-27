import React,{useEffect,useRef,useState} from 'react';
import {formatTime} from './time.mjs';

export default function TimelineFilmstrip({media,start,end,base,enabled}){
  const element=useRef();
  const [count,setCount]=useState(12),[result,setResult]=useState(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const key=`${media.previewUrl}:${start}:${end}:${count}`;
  useEffect(()=>{const observer=new ResizeObserver(([entry])=>setCount(Math.max(6,Math.min(24,Math.ceil(entry.contentRect.width/88)))));observer.observe(element.current);return()=>observer.disconnect();},[]);
  useEffect(()=>{
    if(!enabled)return;
    let stale=false;setError('');
    const timer=setTimeout(()=>{window.creator.timelineThumbnails(media.path,start,end,count).then(frames=>{if(!stale&&frames)setResult({key,frames});}).catch(e=>{if(!stale)setError(e.message);});},200);
    return()=>{stale=true;clearTimeout(timer);};
  },[key,enabled,retry]);
  const frames=result?.key===key?result.frames:null;
  return <div ref={element} className="filmstrip" aria-label="Timeline pictures" aria-busy={enabled&&!frames&&!error}>
    {Array.from({length:count},(_,i)=>{const frame=frames?.[i];return <div className="filmstrip-tile" key={i}>{frame&&<img draggable="false" src={frame.url} data-time={frame.time} alt={`Frame at ${formatTime(frame.time-base)}`} title={formatTime(frame.time-base)}/>}</div>;})}
    {!frames&&<span className="filmstrip-status">{error?<button title={error} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();setRetry(v=>v+1);}}>Pictures unavailable · Retry</button>:enabled?'Loading pictures…':''}</span>}
  </div>;
}
