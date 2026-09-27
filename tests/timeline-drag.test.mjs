import {test} from 'node:test';
import assert from 'node:assert/strict';
import {moveTimelineClip,resizeTimelineEdge} from '../src/timeline-drag.mjs';

test('moving from either side snaps the approaching edge to a fixed playhead',()=>{
  assert.deepEqual(moveTimelineClip({start:1,end:2},1.96,10,4,.08),{start:3,end:4});
  assert.deepEqual(moveTimelineClip({start:6,end:7},-1.96,10,4,.08),{start:4,end:5});
  assert.deepEqual(moveTimelineClip({start:1,end:2},1.96,10,4,.08,true),{start:2.96,end:3.96});
  assert.deepEqual(moveTimelineClip({start:6,end:7},-1.96,10,4,.08,true),{start:4.04,end:5.04});
});
test('dragging keeps length and bounds and snapping follows pixel tolerance at each zoom',()=>{
  assert.deepEqual(moveTimelineClip({start:1,end:2},-10,10,4,.08),{start:0,end:1});
  assert.deepEqual(moveTimelineClip({start:1,end:2},20,10,4,.08),{start:9,end:10});
  assert.deepEqual(moveTimelineClip({start:1,end:2},1.96,10,4,.008),{start:2.96,end:3.96});
  assert.deepEqual(moveTimelineClip({start:1,end:2},1.96,10,20,1),{start:2.96,end:3.96});
  assert.equal(resizeTimelineEdge(3.95,1,5,4,.08),4);
  assert.equal(resizeTimelineEdge(3.95,1,5,4,.08,true),3.95);
  assert.equal(resizeTimelineEdge(3.95,1,3.99,4,.08),3.95);
});
