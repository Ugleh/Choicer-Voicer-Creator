import React,{useState} from 'react';

export default function CharactersPanel({project,sceneId,onApply,onClose}){
  const [scope,setScope]=useState('scene'),[draft,setDraft]=useState({}),[error,setError]=useState('');
  const scenes=scope==='scene'?project.scenes.filter(s=>s.id===sceneId):project.scenes;
  const counts=new Map();for(const scene of scenes)for(const clip of scene.clips)counts.set(clip.character,(counts.get(clip.character)||0)+1);
  const names=[...counts.keys()].sort((a,b)=>a.localeCompare(b)),value=name=>Object.hasOwn(draft,name)?draft[name]:name;
  const changed=names.some(name=>value(name).trim()!==name);
  return <><p className="muted">Rename every matching dialogue line at once. Undo restores the previous names.</p>
    <label className="field"><span>Apply renames to</span><select aria-label="Character rename scope" value={scope} onChange={e=>{setScope(e.target.value);setDraft({});setError('');}}><option value="scene">This scene</option><option value="collection">Entire collection</option></select></label>
    <div className="character-renames">{names.map(name=><label className="character-rename" key={name}><span><strong>{name||'Unassigned'}</strong><small>{counts.get(name)} {counts.get(name)===1?'line':'lines'}</small></span><input aria-label={`Rename ${name||'Unassigned'}`} value={value(name)} placeholder="Character name" onChange={e=>setDraft(d=>({...d,[name]:e.target.value}))}/></label>)}</div>
    {!names.length&&<p className="muted">Add dialogue lines to assign characters.</p>}
    {error&&<p role="alert" className="error-text">{error}</p>}
    <footer><button className="button" onClick={onClose}>Cancel</button><button className="button primary" disabled={!changed} onClick={()=>{try{onApply(names.map(name=>[name,value(name)]),scope==='scene'?sceneId:null);onClose();}catch(e){setError(e.message);}}}>Apply character names</button></footer>
  </>;
}
