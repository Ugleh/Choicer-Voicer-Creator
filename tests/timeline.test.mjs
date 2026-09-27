import {test} from 'node:test';
import assert from 'node:assert/strict';
import {focusLineView} from '../src/timeline.mjs';

test('line focus keeps the entire line visible with context, including scene edges',()=>{
  const scene={start:477,end:657},full=180;
  for(const clip of [{start:0,end:.1},{start:94.699,end:101.26},{start:179,end:180}]){
    const {zoom,pan}=focusLineView(scene,clip),span=full/zoom,start=pan*(full-span);
    assert.ok(zoom>1&&zoom<=64);assert.ok(start>=0&&start+span<=full+.000001);
    assert.ok(start<=clip.start&&start+span>=clip.end);assert.ok(span>=6);
  }
  assert.deepEqual(focusLineView({start:2,end:6},{start:1,end:3}),{zoom:1,pan:0});
});
