import React, {useEffect,useRef,useState} from 'react';
import {Play,Pause} from 'lucide-react';

export default function SoundChoices({result,remaining,onImport,onClose}) {
  const [selected,setSelected]=useState([]),[playing,setPlaying]=useState(null),[error,setError]=useState(''),nodes=useRef(new Map()),playRequest=useRef(0);
  useEffect(()=>{const audio=[...nodes.current.values()];return()=>{playRequest.current++;for(const node of audio)node.pause();};},[]);
  async function audition(effect) {
    const node=nodes.current.get(effect.id);if(!node)return;
    const request=++playRequest.current,stop=playing===effect.id;for(const audio of nodes.current.values())audio.pause();setPlaying(null);if(stop)return;
    node.currentTime=0;setError('');try{await node.play();if(request===playRequest.current)setPlaying(effect.id);}catch{if(request===playRequest.current)setError('Could not play this sound. Try again, or choose a different option.');}
  }
  return <>
    <p>Listen to each sound on its own, then check the ones to add to the scene.</p>
    {result.error&&<p className="amber">{result.error} {result.effects.length} of 4 sounds completed. No remaining requests were retried.</p>}
    <div className="sound-choices">{result.effects.map((effect,index)=><div className="sound-choice" key={effect.id}>
      <label className="checkbox"><input type="checkbox" aria-label={`Import option ${index+1}`} checked={selected.includes(effect.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,effect.id]:ids.filter(id=>id!==effect.id))}/><span><strong>Option {index+1}</strong><small>{effect.duration.toFixed(2)} seconds</small></span></label>
      <button className="button" aria-label={`${playing===effect.id?'Pause':'Play'} option ${index+1}`} onClick={()=>audition(effect)}>{playing===effect.id?<Pause size={15}/>:<Play size={15}/>} {playing===effect.id?'Pause':'Play'}</button>
      <audio data-sound-choice={index+1} ref={node=>{if(node)nodes.current.set(effect.id,node);else nodes.current.delete(effect.id);}} src={effect.url} preload="metadata" onEnded={()=>setPlaying(id=>id===effect.id?null:id)} onError={()=>setError(`Could not load option ${index+1}.`)}/>
    </div>)}</div>
    {error&&<p role="alert" className="amber">{error}</p>}
    <p className="muted small">Selected sounds are added at the requested scene time. You can move and adjust each one afterward.</p>
    {selected.length>remaining&&<p className="amber">This scene has room for {remaining} more effects. Select fewer sounds.</p>}
    <footer><button className="button" onClick={onClose}>Discard choices</button><button className="button primary" disabled={!selected.length||selected.length>remaining} onClick={()=>onImport(result.effects.filter(effect=>selected.includes(effect.id)))}>Import selected ({selected.length})</button></footer>
  </>;
}
