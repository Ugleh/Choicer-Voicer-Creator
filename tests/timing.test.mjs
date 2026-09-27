import {test} from 'node:test';
import assert from 'node:assert/strict';
import {formatTime,parseTime} from '../src/time.mjs';
import {planSceneTrim} from '../electron/scene-trim.mjs';

test('scene times accept matching clock text or seconds without changing precision',()=>{
  for(const [text,seconds] of [['01:34.699',94.699],['94.699',94.699],['1:34.7',94.7],['61:02.001',3662.001],['00:00',0],[' 2.1 ',2.1]])assert.equal(parseTime(text),seconds);
  assert.equal(formatTime(94.699),'01:34.699');assert.equal(formatTime(59.9999),'01:00.000');
  for(const text of ['', '-1', '1:60', '1:02.1234', '1e3','abc','00:01:02','1:2'])assert.equal(parseTime(text),null);
});

test('scene trim shifts retained lines, clips crossing lines and removes only outside lines',()=>{
  const scene={start:100,end:110,clips:[{id:'before',start:0,end:2},{id:'left',start:1,end:3},{id:'middle',start:3,end:5},{id:'right',start:7,end:9},{id:'after',start:8,end:10}]};
  const saved=structuredClone(scene),plan=planSceneTrim(scene,102,108);
  assert.deepEqual(plan.clips,[{id:'left',start:0,end:1},{id:'middle',start:1,end:3},{id:'right',start:5,end:6}]);
  assert.equal(plan.shortened,2);assert.equal(plan.removed,2);assert.equal(plan.offset,2);assert.equal(plan.duration,6);assert.deepEqual(scene,saved);
});

test('trim boundaries use milliseconds and reject extensions, reversed and empty ranges',()=>{
  const scene={start:94.699,end:101.26,clips:[{id:'a',start:.321,end:5.561}]};
  assert.deepEqual(planSceneTrim(scene,95.02,100.26).clips,[{id:'a',start:0,end:5.24}]);
  for(const range of [[94,100],[95,102],[96,95],[96,96],[NaN,99]])assert.throws(()=>planSceneTrim(scene,...range));
});
