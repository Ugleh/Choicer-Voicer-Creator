import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveBoundary, dragRange } from '../src/selection.mjs';

test('marking cannot change a locked endpoint, even when the playhead crosses it', () => {
  assert.deepEqual(moveBoundary([12,20],0,25,[false,true],0,60,true),[20,20]);
  assert.deepEqual(moveBoundary([12,20],1,5,[true,false],0,60,true),[12,12]);
  assert.deepEqual(moveBoundary([12,20],0,15,[true,false],0,60,true),[12,20]);
  assert.deepEqual(moveBoundary([12,20],1,15,[false,true],0,60,true),[12,20]);
  // Starting a new range with I/O still works when neither side is locked.
  assert.deepEqual(moveBoundary([12,20],0,25,[false,false],0,60,true),[25,25]);
});

test('dragging with one lock adjusts only the opposite boundary, with both it only seeks', () => {
  assert.deepEqual(dragRange([12,20],16,25,[true,false],0,60),[12,25]);
  assert.deepEqual(dragRange([12,20],16,10,[false,true],0,60),[10,20]);
  assert.deepEqual(dragRange([12,20],16,3,[true,true],0,60),[12,20]);
  assert.deepEqual(dragRange([12,20],25,16,[false,false],0,60),[16,25]);
});

test('fine adjustments stay within the scene and never push the opposite edge', () => {
  assert.deepEqual(moveBoundary([12,20],0,0,[false,false],10,30),[10,20]);
  assert.deepEqual(moveBoundary([12,20],1,40,[false,false],10,30),[12,30]);
  assert.deepEqual(moveBoundary([12,20],0,22,[false,false],10,30),[20,20]);
  assert.deepEqual(moveBoundary([12,20],1,20-1/24,[true,false],10,30),[12,19.958]);
  assert.deepEqual(moveBoundary([12,20],0,NaN,[false,false],10,30),[12,20]);
});
