import React, {useEffect, useRef} from 'react';

export default function SceneMenu({scene,x,y,onClose,onDelete,onToggle}) {
  const menu=useRef(null);
  useEffect(()=>{
    const previous=document.activeElement;
    menu.current?.querySelector('button')?.focus();
    const dismiss=event=>{if(!menu.current?.contains(event.target))onClose();};
    const blur=()=>onClose();
    window.addEventListener('pointerdown',dismiss);window.addEventListener('blur',blur);
    window.addEventListener('scroll',blur,true);
    return()=>{window.removeEventListener('pointerdown',dismiss);window.removeEventListener('blur',blur);window.removeEventListener('scroll',blur,true);if(previous?.isConnected)previous.focus({preventScroll:true});};
  },[]);
  return <div ref={menu} className="scene-menu" role="menu" aria-label={`Scene actions: ${scene.name}`} style={{left:Math.max(8,Math.min(x,window.innerWidth-260)),top:Math.max(8,Math.min(y,window.innerHeight-135))}} onKeyDown={e=>{
    e.stopPropagation();
    if(e.key==='Escape'||e.key==='Tab'){e.preventDefault();onClose();}
    if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const items=[...menu.current.querySelectorAll('button')],i=items.indexOf(document.activeElement);items[e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();}
  }}>
    <strong>{scene.name}</strong>
    <button role="menuitemcheckbox" aria-checked={scene.excludeFromCollection!==true} onClick={onToggle}>{scene.excludeFromCollection?'Enable in export collection':'Disable from export collection'}</button>
    <button role="menuitem" className="delete-scene" onClick={onDelete}>Delete scene</button>
  </div>;
}
