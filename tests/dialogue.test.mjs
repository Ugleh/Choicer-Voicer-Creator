import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignCharacter, mergeLines, selectedLines, sharedCharacter, selectDialogue, renameCharacters } from '../src/dialogue.mjs';

const sample = () => [
  {id:'a',start:94.699,end:95.02,caption:'I mean,',character:'Speaker 1'},
  {id:'b',start:95.74,end:101.26,caption:"that, that doesn't really even seem possible if you think about it, with body organs and",character:'Speaker 1'},
  {id:'c',start:102,end:103,caption:'Another person.',character:'Speaker 2'},
];

test('Shift selection follows display order, retains its anchor, and Ctrl-Shift adds a range',()=>{
  const clips=[{id:'d',start:4},{id:'a',start:1},{id:'b',start:2},{id:'c',start:2},{id:'e',start:5}];
  assert.deepEqual(selectDialogue(clips,['b'],'e','b',{range:true}),{ids:['b','c','d','e'],anchor:'b'});
  assert.deepEqual(selectDialogue(clips,['b','c','d','e'],'a','b',{range:true}),{ids:['b','a'],anchor:'b'});
  assert.deepEqual(selectDialogue(clips,['a','d'],'e','d',{range:true,additive:true}),{ids:['a','d','e'],anchor:'d'});
  assert.deepEqual(selectDialogue(clips,[],'c','missing',{range:true}),{ids:['c'],anchor:'c'});
});

test('character renaming is simultaneous and can be scoped to one scene',()=>{
  const scenes=[{id:'one',clips:sample()},{id:'two',clips:sample()}],before=structuredClone(scenes);
  const local=renameCharacters(scenes,[['Speaker 1','Vendor']],'one');assert.equal(local[0].clips[0].character,'Vendor');assert.equal(local[0].clips[1].character,'Vendor');assert.strictEqual(local[1],scenes[1]);
  const all=renameCharacters(scenes,[['Speaker 1','Speaker 2'],['Speaker 2','Customer']]);assert.equal(all[1].clips[0].character,'Speaker 2');assert.equal(all[1].clips[2].character,'Customer');assert.deepEqual(scenes,before);
  assert.throws(()=>renameCharacters(scenes,[['Speaker 1',' ']]),/name/);
});

test('merging the reported lines preserves the whole interval and joins captions chronologically', () => {
  const clips=sample(),before=structuredClone(clips),result=mergeLines(clips,['b','a']);
  assert.equal(result.merged.start,94.699);assert.equal(result.merged.end,101.26);
  assert.equal(Math.round((result.merged.end-result.merged.start)*1000),6561);
  assert.equal(result.merged.caption,"I mean, that, that doesn't really even seem possible if you think about it, with body organs and");
  assert.equal(result.merged.character,'Speaker 1');assert.equal(result.clips.length,2);
  assert.strictEqual(result.clips[1],clips[2]);assert.deepEqual(clips,before);
});

test('batch assignment changes only selected characters without editing captions or times', () => {
  const clips=sample(),result=assignCharacter(clips,['a','c'],'  Nut Vendor  ');
  assert.deepEqual(result,[{...clips[0],character:'Nut Vendor'},clips[1],{...clips[2],character:'Nut Vendor'}]);
  assert.equal(clips[0].character,'Speaker 1');assert.throws(()=>assignCharacter(clips,['a'],' '),/character name/);
});

test('mixed characters must be explicitly unified, and merged clips remain below the game limit', () => {
  const clips=sample();assert.equal(sharedCharacter(selectedLines(clips,['a','c'])),null);
  assert.throws(()=>mergeLines(clips,['a','c']),/Assign one character/);
  assert.equal(mergeLines(assignCharacter(clips,['a','c'],'Vendor'),['a','c']).merged.character,'Vendor');
  assert.throws(()=>mergeLines(clips,['a','missing']),/at least two/);
  assert.throws(()=>mergeLines([{...clips[0],start:0},{...clips[1],end:60}],['a','b']),/shorter than 60/);
});

test('overlapping intervals keep the latest end and unselected simultaneous lines remain intact', () => {
  const clips=[{id:'a',start:1,end:5,caption:'First',character:'A'},{id:'b',start:2,end:3,caption:'second',character:'A'},{id:'c',start:1,end:4,caption:'Together',character:'B'}];
  const result=mergeLines(clips,['b','a']);assert.equal(result.merged.end,5);
  assert.equal(result.merged.caption,'First second');assert.strictEqual(result.clips.find(c=>c.id==='c'),clips[2]);
});
