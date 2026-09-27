import React,{useEffect,useRef} from 'react';
export default function ElementMenu({position,onClose,onAction,canPaste}){
  const root=useRef();
  useEffect(()=>{const prev=document.activeElement;root.current?.querySelector('button').focus();const close=e=>{if(!root.current?.contains(e.target))onClose();};window.addEventListener('pointerdown',close);return()=>{window.removeEventListener('pointerdown',close);if(prev?.isConnected)prev.focus({preventScroll:true});};},[]);
  return <div ref={root} className="element-menu" role="menu" aria-label="Dialogue actions" style={{left:Math.max(8,Math.min(position.x,window.innerWidth-195)),top:Math.max(8,Math.min(position.y,window.innerHeight-180))}} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();onClose();}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const items=[...root.current.querySelectorAll('button:not(:disabled)')],i=items.indexOf(document.activeElement);items[(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();}}}>
    {['copy','cut','paste','delete'].map(action=><button role="menuitem" key={action} disabled={action==='paste'&&!canPaste} onClick={()=>onAction(action)}>{action[0].toUpperCase()+action.slice(1)}</button>)}
  </div>;
}
