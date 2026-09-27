import React,{useEffect,useRef,useState} from 'react';

export default function MenuBar({onAction,disabled,canSave,canUndo,canRedo,canEdit,canPaste,hasScenes,hasScene,pinned,showLines}){
  const [open,setOpen]=useState(null),root=useRef(),origin=useRef(null);
  const text=origin.current?.matches('input,textarea,select')||origin.current?.isContentEditable;
  const groups={
    File:[['new','New Project','Ctrl+N'],['video','Open Video…','Ctrl+Shift+O'],['open','Open Project…','Ctrl+O'],null,['save','Save','Ctrl+S',!canSave],['saveAs','Save As…','Ctrl+Shift+S',!canSave],null,['export','Export Collection…','',!hasScenes],['exportScene','Export Scene Pack…','',!hasScene],null,['settings','Settings & Usage…'],['exit','Exit']],
    Edit:[['undo','Undo','Ctrl+Z',!canUndo&&!text],['redo','Redo','Ctrl+Shift+Z',!canRedo&&!text],null,['cut','Cut','Ctrl+X',!canEdit&&!text],['copy','Copy','Ctrl+C',!canEdit&&!text],['paste','Paste','Ctrl+V',!canPaste&&!text],['delete','Delete','Delete',!canEdit&&!text],['selectAll','Select All','Ctrl+A']],
    View:[['pin','Pin Preview','',false,pinned],['lines','Show Dialogue Lines','',false,showLines],['fullscreen','Full Screen','F11']],
    Help:[['help','Creator Guide']]
  };
  useEffect(()=>{if(!open)return;const close=e=>{if(!root.current?.contains(e.target))setOpen(null);};const blur=()=>setOpen(null);window.addEventListener('pointerdown',close);window.addEventListener('blur',blur);return()=>{window.removeEventListener('pointerdown',close);window.removeEventListener('blur',blur);};},[open]);
  useEffect(()=>{if(disabled)setOpen(null);},[disabled]);
  useEffect(()=>{if(open)root.current?.querySelector('.menu-popup button:not(:disabled)')?.focus({preventScroll:true});},[open]);
  function show(name){if(!open)origin.current=document.activeElement;setOpen(open===name?null:name);}
  function act(id){setOpen(null);if(origin.current?.isConnected)origin.current.focus({preventScroll:true});onAction(id);}
  return <nav className="menu-bar" aria-label="Application menu" ref={root} onKeyDown={e=>{
    if(e.key==='Escape'){e.stopPropagation();setOpen(null);origin.current?.focus({preventScroll:true});}
    if(open&&['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();e.stopPropagation();const items=[...root.current.querySelectorAll('.menu-popup button:not(:disabled)')],i=items.indexOf(document.activeElement);items[e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowUp'?-1:1)+items.length)%items.length]?.focus();}
    if(open&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();e.stopPropagation();const names=Object.keys(groups);setOpen(names[(names.indexOf(open)+(e.key==='ArrowLeft'?-1:1)+names.length)%names.length]);}
  }}>
    {Object.entries(groups).map(([name,items])=><div className="menu-group" key={name}>
      <button className="menu-trigger" disabled={disabled} aria-haspopup="menu" aria-expanded={open===name} onPointerDown={e=>e.preventDefault()} onClick={()=>show(name)} onMouseEnter={()=>{if(open)setOpen(name);}}>{name}</button>
      {open===name&&<div className="menu-popup" role="menu" aria-label={name}>{items.map((item,i)=>item?<button key={item[0]} role={item.length>4?'menuitemcheckbox':'menuitem'} aria-checked={item.length>4?item[4]:undefined} disabled={item[3]} onPointerDown={e=>e.preventDefault()} onClick={()=>act(item[0])}><span>{item.length>4?(item[4]?'✓ ':'　 '):''}{item[1]}</span>{item[2]&&<kbd>{item[2]}</kbd>}</button>:<hr key={i}/>)}</div>}
    </div>)}
  </nav>;
}
