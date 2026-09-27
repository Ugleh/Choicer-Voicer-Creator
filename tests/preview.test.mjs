import {test} from 'node:test';
import assert from 'node:assert/strict';
import {activeSceneLines,previewBounds} from '../src/preview.mjs';

test('scene playback captions come from all lines without requiring a selected line',()=>{
  const scene={start:100,end:108,clips:Array.from({length:16},(_,i)=>({id:String(i),start:i*.5,end:(i+1)*.5,caption:`Line ${i}`}))};
  for(let i=0;i<16;i++)assert.deepEqual(activeSceneLines(scene,100+i*.5+.1).map(c=>c.id),[String(i)]);
  assert.deepEqual(activeSceneLines(scene,99),[]);assert.deepEqual(activeSceneLines(scene,108),[]);
});

test('simultaneous captions remain visible together and boundaries are end-exclusive',()=>{
  const scene={start:10,end:15,clips:[{id:'a',start:.2,end:1},{id:'b',start:.2,end:2},{id:'c',start:2,end:3}]};
  assert.deepEqual(activeSceneLines(scene,10.2).map(c=>c.id),['a','b']);
  assert.deepEqual(activeSceneLines(scene,11).map(c=>c.id),['b']);
  assert.deepEqual(activeSceneLines(scene,12).map(c=>c.id),['c']);
});

test('scene navigation ends on its last nominal frame and handles very short scenes',()=>{
  const media={duration:200,fps:24};
  assert.deepEqual(previewBounds(media,{start:10,end:20},false),{start:10,end:20,lastFrame:20-1/24});
  assert.deepEqual(previewBounds(media,{start:10,end:20},true),{start:0,end:200,lastFrame:200-1/24});
  assert.equal(previewBounds(media,{start:10,end:10.01},false).lastFrame,10);
});
