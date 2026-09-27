import {test} from 'node:test';
import assert from 'node:assert/strict';
import {collectionStats,shareContent,splitDiscord,wordCount} from '../shared/sharing.mjs';

const project=()=>({version:1,name:'Movie collection',packTitle:'Kung Pow Favorites',author:'Pack Maker',media:{path:'C:\\private\\secret.mkv'},shareDetails:{intro:'A favorite collection.',downloadUrl:'https://example.com/pack.zip'},scenes:[
  {id:'a',name:'Intro',start:20,end:30,linePadding:5,clips:[{start:1,end:3,caption:"That's a lot of nuts!",character:'Vendor'},{start:2,end:4,caption:'Four bucks, baby.',character:'Vendor'},{start:2,end:5,caption:'Hey!',character:'Customer'}]},
  {id:'b',name:'Chorus',start:50,end:55,clips:[{start:.5,end:1.5,caption:'Hey!',character:'Vendor'},{start:.5,end:1.5,caption:'Hey!',character:'Vendor'}]}
]});

test('sharing statistics count caption words and union dialogue intervals without padding or source gaps',()=>{
  const data=project(),before=structuredClone(data),stats=collectionStats(data);
  assert.equal(stats.title,'Kung Pow Favorites');assert.equal(stats.duration,15);assert.equal(stats.lines,5);assert.equal(stats.words,11);assert.equal(stats.dialogueTime,5);
  assert.deepEqual(stats.characters,[{name:'Vendor',scenes:2,lines:4,words:10,dialogueTime:4},{name:'Customer',scenes:1,lines:1,words:1,dialogueTime:3}]);
  assert.equal(stats.scenes[0].dialogueTime,4);assert.equal(stats.scenes[0].words,9);assert.deepEqual(data,before);
  assert.equal(wordCount("Don't stop—go! 42"),4);assert.equal(wordCount('... !!!'),0);
  const draft=project();draft.scenes[0].clips.push({start:-5,end:50,caption:'Invalid timing',character:''});const report=collectionStats(draft);assert.equal(report.invalidTimings,1);assert.equal(report.dialogueTime,5);assert.ok(report.characters.some(c=>c.name==='Unassigned'));
});

test('platform formats preserve stats, escape user text, and contain no private media fields',()=>{
  const data=project();data.packTitle='<img src=x onerror=alert(1)> | **Nuts**';data.scenes[0].name='Intro | Escape';data.scenes[0].clips[0].character='@everyone';data.shareDetails.intro='<script>alert(1)</script> & "fun"';
  const reddit=shareContent(data,'reddit'),discord=shareContent(data,'discord'),banana=shareContent(data,'gamebanana');
  assert.match(reddit.body,/Intro \\\| Escape/);assert.match(reddit.body,/\| Character \| Scenes \| Lines \| Words \| Dialogue time \|/);
  assert.ok(!discord.body.includes('@everyone'));assert.ok(discord.body.includes('@\u200beveryone'));
  assert.ok(!banana.html.includes('<script>'));assert.ok(!banana.html.includes('<img'));assert.ok(banana.html.includes('&lt;script&gt;'));assert.ok(banana.html.includes('<table>'));assert.ok(banana.plain.includes('Characters'));
  for(const content of [reddit,discord,banana]){assert.ok(!content.body.includes('C:\\private'));assert.ok(content.body.includes('11 words'));assert.ok(content.body.includes('not measured visual screen time'));}
  data.shareDetails.downloadUrl='javascript:alert(1)';assert.throws(()=>shareContent(data,'gamebanana'),/http/);
  data.shareDetails.downloadUrl='https://user:secret@example.com';assert.throws(()=>shareContent(data,'reddit'),/credentials/);
});

test('Discord splitting preserves every character and stays within the standard message limit',()=>{
  for(const text of ['A short message','😀'.repeat(5000),'\\'.repeat(10000),Array.from({length:100},(_,i)=>`Character ${i} — 20 lines · 70 words\n\n`).join('')]){
    const parts=splitDiscord(text);assert.ok(parts.every(p=>p.length<=2000));assert.equal(parts.map(p=>p.replace(/^Part \d+\/\d+\n/,'')).join(''),text);assert.ok(parts.every(p=>!/[\uD800-\uDBFF]$/.test(p)));
  }
  const data=project();data.shareDetails.intro='A longer introduction. '.repeat(220);const content=shareContent(data,'discord');assert.ok(content.parts.length>1);assert.ok(content.parts.every(part=>part.length<=2000));
});
