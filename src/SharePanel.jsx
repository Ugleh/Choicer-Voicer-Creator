import React,{useState} from 'react';
import {Copy,Check} from 'lucide-react';
import {shareContent,durationText} from '../shared/sharing.mjs';

const labels={reddit:'Reddit',discord:'Discord',gamebanana:'GameBanana'};
export default function SharePanel({project,initialPlatform,onDetailsChange}){
  const [platform,setPlatform]=useState(initialPlatform),[part,setPart]=useState(0),[copied,setCopied]=useState(''),[copyError,setCopyError]=useState('');
  let content,error='';try{content=shareContent(project,platform);}catch(e){error=e.message;}
  const current=Math.min(part,(content?.parts.length||1)-1),details=project.shareDetails||{};
  const change=(key,value)=>{setCopied('');setCopyError('');onDetailsChange({...details,[key]:value});};
  async function copy(kind){setCopyError('');try{await window.creator.copyShare(project,platform,kind,current);setCopied(kind);}catch(e){setCopyError(e.message);}}
  return <div className="share-panel"><div className="share-tabs" role="tablist" aria-label="Sharing format">{Object.entries(labels).map(([key,label])=><button key={key} role="tab" aria-selected={platform===key} className={platform===key?'active':''} onClick={()=>{setPlatform(key);setPart(0);setCopied('');setCopyError('');}}>{label}</button>)}</div>
    <div className="share-details"><label className="field"><span>Introduction · optional</span><textarea aria-label="Share introduction" rows={2} maxLength={6000} value={details.intro??project.description??''} onChange={e=>change('intro',e.target.value)} placeholder="Tell players what makes this collection fun."/></label><label className="field"><span>Download link · optional</span><input aria-label="Share download link" type="url" maxLength={2048} value={details.downloadUrl||''} onChange={e=>change('downloadUrl',e.target.value)} placeholder="https://…"/></label></div>
    {error?<p className="error-text" role="alert">{error}</p>:<>
      <div className="share-stats"><span><b>{content.stats.scenes.length}</b> {content.stats.scenes.length===1?'scene':'scenes'}</span><span><b>{content.stats.characters.length}</b> {content.stats.characters.length===1?'character':'characters'}</span><span><b>{content.stats.lines}</b> {content.stats.lines===1?'line':'lines'}</span><span><b>{content.stats.words}</b> {content.stats.words===1?'word':'words'}</span><span><b>{durationText(content.stats.duration)}</b> edited runtime</span></div>
      <div className="share-title"><span>{content.title}</span><button className="button" onClick={()=>copy('title')}>{copied==='title'?<Check size={14}/>:<Copy size={14}/>} {copied==='title'?'Title copied':'Copy title'}</button></div>
      <p className="share-instructions">{platform==='reddit'?'Paste the body into Reddit’s desktop Markdown editor.':platform==='discord'?`Paste each message in order. ${content.parts.length} message${content.parts.length===1?'':'s'}, each under 2,000 characters.`:'Copy the formatted description into GameBanana’s editor. A plain-text version is included on the clipboard; HTML source is also available.'}</p>
      {platform==='discord'&&content.parts.length>1&&<label className="field"><span>Message</span><select aria-label="Discord message" value={current} onChange={e=>{setPart(+e.target.value);setCopied('');}}>{content.parts.map((text,i)=><option key={i} value={i}>Message {i+1} of {content.parts.length} · {text.length} characters</option>)}</select></label>}
      {platform==='gamebanana'?<div className="share-rich-preview" aria-label="GameBanana description preview" dangerouslySetInnerHTML={{__html:content.html}}/>:<textarea className="share-copy-text" aria-label={`${labels[platform]} share text`} readOnly value={content.parts[current]}/>}
      <div className="share-copy-actions"><button className="button primary" onClick={()=>copy('body')}>{copied==='body'?<Check size={15}/>:<Copy size={15}/>} {copied==='body'?'Copied':platform==='discord'?`Copy message ${current+1}`:platform==='gamebanana'?'Copy formatted description':'Copy body'}</button>{platform==='gamebanana'&&<><button className="button" onClick={()=>copy('plain')}>{copied==='plain'?'Text copied':'Copy plain text'}</button><button className="button" onClick={()=>copy('html')}>{copied==='html'?'HTML copied':'Copy HTML'}</button></>}<span className="muted">{content.parts[current].length.toLocaleString()} characters</span></div>
      <p className="share-footnote">Dialogue time is based on your line timings, without padding. Overlaps count once per character; visual screen time is not measured. Introduction and link save with the project.</p>
    </>}{copyError&&<p className="error-text" role="alert">{copyError}</p>}
  </div>;
}
