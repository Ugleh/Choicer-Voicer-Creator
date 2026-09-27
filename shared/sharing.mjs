const segmenter=new Intl.Segmenter('en',{granularity:'word'});
const clean=value=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');
const oneLine=value=>clean(value).replace(/\s+/g,' ').trim();
export const wordCount=value=>[...segmenter.segment(clean(value))].filter(word=>word.isWordLike).length;
export function durationText(seconds){const tenths=Math.round(Math.max(0,seconds)*10),s=Math.floor(tenths/10)%60,m=Math.floor(tenths/600)%60,h=Math.floor(tenths/36000);return `${h?h+':':''}${String(h?m:Math.floor(tenths/600)).padStart(2,'0')}:${String(s).padStart(2,'0')}.${tenths%10}`;}
function unionTime(intervals){let end=-1,total=0;for(const [a,b] of [...intervals].sort((x,y)=>x[0]-y[0])){total+=Math.max(0,b-Math.max(a,end));end=Math.max(end,b);}return total;}

export function collectionStats(project){
  const characters=new Map();let words=0,lines=0,dialogueMs=0,durationMs=0,invalidTimings=0;
  const scenes=project.scenes.map((scene,index)=>{
    const duration=Math.max(0,Math.round((scene.end-scene.start)*1000)),intervals=[],byCharacter=new Map();let sceneWords=0;
    for(const clip of scene.clips){
      const name=oneLine(clip.character)||'Unassigned',count=wordCount(clip.caption);sceneWords+=count;
      if(!characters.has(name))characters.set(name,{name,lines:0,words:0,dialogueMs:0,scenes:0});
      const character=characters.get(name);character.lines++;character.words+=count;
      if(!byCharacter.has(name))byCharacter.set(name,[]);
      if(Number.isFinite(clip.start)&&Number.isFinite(clip.end)&&clip.start>=0&&clip.end>clip.start&&clip.end*1000<=duration+5){
        const range=[Math.round(clip.start*1000),Math.min(duration,Math.round(clip.end*1000))];intervals.push(range);byCharacter.get(name).push(range);
      }else invalidTimings++;
    }
    for(const [name,ranges] of byCharacter){const character=characters.get(name);character.scenes++;character.dialogueMs+=unionTime(ranges);}
    const speaking=unionTime(intervals);words+=sceneWords;lines+=scene.clips.length;durationMs+=duration;dialogueMs+=speaking;
    return {number:index+1,name:oneLine(scene.name)||`Scene ${index+1}`,description:oneLine(scene.description),duration:duration/1000,dialogueTime:speaking/1000,lines:scene.clips.length,words:sceneWords,characters:[...byCharacter.keys()]};
  });
  return {title:oneLine(project.packTitle)||oneLine(project.name)||'Untitled collection',author:oneLine(project.author),scenes,characters:[...characters.values()].map(({dialogueMs,...c})=>({...c,dialogueTime:dialogueMs/1000})).sort((a,b)=>b.words-a.words||a.name.localeCompare(b.name)),lines,words,duration:durationMs/1000,dialogueTime:dialogueMs/1000,invalidTimings};
}

const escapeHtml=value=>clean(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const escapeMarkdown=value=>oneLine(value).replace(/[\\`*_{}\[\]()#+.!|>~<\-]/g,'\\$&');
function downloadLink(value){
  const text=String(value??'').trim();if(!text)return '';
  let url;try{url=new URL(text);}catch{throw Error('Enter a complete http:// or https:// download link.');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Use an http:// or https:// download link without embedded credentials.');
  return url.href;
}
const quantity=(value,noun)=>`${value} ${noun}${value===1?'':'s'}`;
const statsNote='Words are counted from captions for each dialogue line. Dialogue time uses line boundaries, excludes export padding, and counts overlaps once per character within each scene. It is not measured visual screen time. Total dialogue time counts overlapping characters once.';
const install='Place the exported pack folder in The Choicer Voicer/packs_voice, then select it in Dub Mode.';
export function splitDiscord(text,limit=2000){
  // Leave space for part labels, split at paragraph/line boundaries where possible,
  // and never split a Unicode surrogate pair or a Markdown escape sequence.
  const size=limit-40,chunks=[];let rest=text;
  while(rest.length>size){let at=rest.lastIndexOf('\n\n',size);if(at<size/2)at=rest.lastIndexOf('\n',size);if(at<size/2)at=rest.lastIndexOf(' ',size);if(at<size/2)at=size;if(/[\uD800-\uDBFF]/.test(rest[at-1]))at--;let slashes=0;for(let i=at-1;i>=0&&rest[i]==='\\';i--)slashes++;if(slashes%2&&at>1)at--;chunks.push(rest.slice(0,at));rest=rest.slice(at);}
  chunks.push(rest);return chunks.length===1?chunks:chunks.map((chunk,i)=>`Part ${i+1}/${chunks.length}\n${chunk}`);
}

export function shareContent(project,platform){
  if(!['reddit','discord','gamebanana'].includes(platform))throw Error('Choose Reddit, Discord, or GameBanana.');
  const stats=collectionStats(project),intro=clean(project.shareDetails?.intro??project.description??'').trim(),url=downloadLink(project.shareDetails?.downloadUrl);
  const summary=`${quantity(stats.scenes.length,'scene')} · ${quantity(stats.characters.length,'character')} · ${quantity(stats.lines,'dialogue line')} · ${quantity(stats.words,'word')} · ${durationText(stats.duration)} edited runtime · ${durationText(stats.dialogueTime)} dialogue time`;
  const rows=stats.characters.map(c=>[c.name,c.scenes,c.lines,c.words,durationText(c.dialogueTime)]);
  const sceneRows=stats.scenes.map(s=>[`${s.number}. ${s.name}`,durationText(s.duration),s.lines,s.words,s.characters.join(', ')||'None']);
  const warning=stats.invalidTimings?`${stats.invalidTimings} lines have invalid timing and are excluded from dialogue-time totals.`:'';
  const plain=[stats.title,'The Choicer Voicer — Dub Pack Collection',stats.author&&`Pack author: ${stats.author}`,intro,summary,'Scenes',...stats.scenes.map(s=>`${s.number}. ${s.name} — ${durationText(s.duration)} · ${quantity(s.lines,'line')} · ${quantity(s.words,'word')}\nCharacters: ${s.characters.join(', ')||'None'}${s.description?'\n'+s.description:''}`),'Characters',...stats.characters.map(c=>`${c.name} — ${quantity(c.scenes,'scene')} · ${quantity(c.lines,'line')} · ${quantity(c.words,'word')} · ${durationText(c.dialogueTime)} dialogue time`),statsNote,warning,'Installation',install,url&&`Download: ${url}`].filter(Boolean).join('\n\n');
  const table=(headers,values)=>`| ${headers.map(escapeMarkdown).join(' | ')} |\n| ${headers.map(()=>'---').join(' | ')} |\n${values.map(row=>`| ${row.map(escapeMarkdown).join(' | ')} |`).join('\n')}`;
  const htmlTable=(headers,values)=>`<table><thead><tr>${headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${values.map(row=>`<tr>${row.map(cell=>`<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  const characterHeaders=['Character','Scenes','Lines','Words','Dialogue time'],sceneHeaders=['Scene','Duration','Lines','Words','Characters'];
  const html=`<h2>${escapeHtml(stats.title)}</h2><p>The Choicer Voicer — Dub Pack Collection</p>${stats.author?`<p><strong>Pack author:</strong> ${escapeHtml(stats.author)}</p>`:''}${intro?`<p>${escapeHtml(intro).replace(/\n/g,'<br>')}</p>`:''}<p>${escapeHtml(summary)}</p><h3>Scenes</h3>${htmlTable(sceneHeaders,sceneRows)}${stats.scenes.filter(s=>s.description).map(s=>`<p><strong>${escapeHtml(s.name)}:</strong> ${escapeHtml(s.description)}</p>`).join('')}<h3>Characters</h3>${htmlTable(characterHeaders,rows)}<p>${escapeHtml(statsNote)}</p>${warning?`<p>${escapeHtml(warning)}</p>`:''}<h3>Installation</h3><p>${escapeHtml(install)}</p>${url?`<p><a href="${escapeHtml(url)}">Download the pack</a></p>`:''}`;
  let body=plain;
  if(platform==='reddit')body=[`# ${escapeMarkdown(stats.title)}`,'The Choicer Voicer — Dub Pack Collection',stats.author&&`**Pack author:** ${escapeMarkdown(stats.author)}`,intro&&intro.split('\n').map(escapeMarkdown).join('\n\n'),summary,'## Scenes',table(sceneHeaders,sceneRows),...stats.scenes.filter(s=>s.description).map(s=>`**${escapeMarkdown(s.name)}:** ${escapeMarkdown(s.description)}`),'## Characters',table(characterHeaders,rows),statsNote,warning,'## Installation',install,url&&`[Download the pack](${url.replace(/[()]/g,c=>c==='('?'%28':'%29')})`].filter(Boolean).join('\n\n');
  if(platform==='discord'){
    body=[`**${escapeMarkdown(stats.title)}**`,'The Choicer Voicer — Dub Pack Collection',stats.author&&`Pack author: ${escapeMarkdown(stats.author)}`,intro&&intro.split('\n').map(escapeMarkdown).join('\n'),summary,'**Scenes**',...stats.scenes.map(s=>`- ${s.number}. ${escapeMarkdown(s.name)} — ${durationText(s.duration)} · ${quantity(s.lines,'line')} · ${quantity(s.words,'word')}\n  Characters: ${escapeMarkdown(s.characters.join(', ')||'None')}${s.description?'\n  '+escapeMarkdown(s.description):''}`),'**Characters**',...stats.characters.map(c=>`- ${escapeMarkdown(c.name)} — ${quantity(c.scenes,'scene')} · ${quantity(c.lines,'line')} · ${quantity(c.words,'word')} · ${durationText(c.dialogueTime)} dialogue time`),statsNote,warning,'**Installation**',install,url&&`Download: <${url}>`].filter(Boolean).join('\n\n').replace(/@/g,'@\u200b');
  }
  return {stats,title:stats.title,body,html,plain,parts:platform==='discord'?splitDiscord(body):[body],note:statsNote};
}
