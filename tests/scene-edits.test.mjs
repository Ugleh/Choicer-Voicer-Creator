import {test} from 'node:test';
import assert from 'node:assert/strict';
import {moveDialogueGroup,pasteElements,reorderScenes} from '../src/scene-edits.mjs';
const lines=[{id:'a',start:1,end:2,caption:'One',character:'A'},{id:'b',start:3,end:4,caption:'Two',character:'B'}];
test('group dragging preserves spacing, duration and boundaries, and snaps the whole selection',()=>{
  assert.deepEqual(moveDialogueGroup(lines,-5,10,0,0,true).map(c=>[c.start,c.end]),[[0,1],[2,3]]);
  assert.deepEqual(moveDialogueGroup(lines,20,10,0,0,true).map(c=>[c.start,c.end]),[[7,8],[9,10]]);
  assert.equal(moveDialogueGroup(lines,1.96,10,6,.05,false)[1].end,6);
  assert.equal(moveDialogueGroup(lines,1.96,10,6,.05,true)[1].end,5.96);
  assert.equal(lines[0].start,1);
});
test('clipboard preserves group offsets and metadata, assigns fresh ids and rejects overflow',()=>{
  let id=0;const uid=()=>String(++id),copies=pasteElements({kind:'clips',items:lines},4,10,uid);
  assert.deepEqual(copies.map(c=>[c.start,c.end,c.character]),[[4,5,'A'],[6,7,'B']]);
  assert.equal(new Set([...lines,...copies].map(c=>c.id)).size,4);
  assert.throws(()=>pasteElements({items:lines},9,10,uid),/does not fit/);
  const effect={id:'fx',start:0,end:1,path:'sound.wav',offset:.2,gain:.3,fadeIn:.1,fadeOut:.2,muted:true};
  assert.deepEqual({...pasteElements({items:[effect]},2,10,uid)[0],id:'fx',start:0,end:1},effect);
});
test('scene reordering supports both directions and preserves identities and no-op history',()=>{
  const scenes=[{id:'a'},{id:'b',excludeFromCollection:true},{id:'c'}];
  assert.deepEqual(reorderScenes(scenes,'a','c',true).map(s=>s.id),['b','c','a']);
  assert.deepEqual(reorderScenes(scenes,'c','a').map(s=>s.id),['c','a','b']);
  assert.equal(reorderScenes(scenes,'a','b'),scenes);
  assert.equal(reorderScenes(scenes,'x','a'),scenes);
  assert.equal(reorderScenes(scenes,'a','c')[0],scenes[1]);
});
