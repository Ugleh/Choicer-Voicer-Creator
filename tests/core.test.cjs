const {test}=require('node:test');const assert=require('node:assert/strict');
const {safeName,clipIni,packIni,validateScene,transcriptToClips}=require('../electron/core.cjs');
test('Godot metadata escapes captions and uses scene-relative array timestamps',()=>{
  const ini=clipIni({caption:'He said "go".\nNow!\\',character:'Nut "Vendor"',start:3.42});
  assert.match(ini,/^\[data\]\r\n/);assert.match(ini,/dub_timestamps=\[3\.420\]/);assert.match(ini,/dub_characters=\["Nut \\"Vendor\\""\]/);
  assert.equal(JSON.parse(ini.split('\r\n').find(x=>x.startsWith('caption=')).slice(8)),'He said "go".\nNow!\\');
  assert.match(packIni({name:'Kung Pow',author:'Me'},{name:'Nuts'}),/title="Kung Pow - Nuts"/);
});
test('filenames cannot escape output or use Windows device names',()=>{assert.equal(safeName('../foo\\bar: '),'..foobar');assert.equal(safeName('CON'),'_CON');assert.equal(safeName('...'),'Untitled');assert.equal(safeName('NUL.txt'),'_NUL.txt');});
test('four simultaneous character lines retain the same exported timestamp and pass validation',()=>{
  const s=scene();s.clips=Array.from({length:4},(_,i)=>({id:String(i),caption:'Hey!',character:`Character ${i+1}`,start:3.42,end:4.5}));
  assert.deepEqual(validateScene(s,media).errors,[]);
  for(const clip of s.clips)assert.match(clipIni(clip),/dub_timestamps=\[3\.420\]/);
});
const media={duration:100,audioIndex:1};
const scene=()=>({name:'Nuts',start:10,end:20,clips:[{caption:'Hello',character:'Vendor',start:3.42,end:4.5}],backing:{path:'backing.wav',duration:10,sourceStart:10,sourceEnd:20,audioIndex:1,reviewed:true}});
test('validation rejects stale and unreviewed supplied backing tracks',()=>{assert.deepEqual(validateScene(scene(),media).errors,[]);const s=scene();s.backing.reviewed=false;assert.match(validateScene(s,media).errors.join(' '),/reviewed/);s.backing.reviewed=true;s.start=11;assert.match(validateScene(s,media).errors.join(' '),/no longer matches/);});
test('validation rejects out-of-scene and overlong clips but warns at six seconds',()=>{const s=scene();s.clips[0].end=11;assert.match(validateScene(s,media).errors.join(' '),/boundaries/);s.clips[0]={caption:'Test',character:'A',start:0,end:6.1};assert.equal(validateScene(s,media).warnings.length,1);s.clips[0].end=60;assert.match(validateScene(s,media).errors.join(' '),/shorter than 60/);});
test('ASR groups at punctuation, pauses and speaker changes without losing leading time',()=>{
  const result=transcriptToClips({words:[{type:'word',start:1.2,end:1.4,text:'Hello',speaker_id:'speaker_0'},{type:'spacing',start:1.4,end:1.4,text:' '},{type:'word',start:1.5,end:2,text:'there!',speaker_id:'speaker_0'},{type:'word',start:2.1,end:2.8,text:'Yep.',speaker_id:'speaker_1'},{type:'audio_event',start:3,end:4,text:'[music]'}]},5);
  assert.equal(result.length,2);assert.equal(result[0].start,1.2);assert.equal(result[0].caption,'Hello there!');assert.equal(result[1].character,'Speaker 1');
});
