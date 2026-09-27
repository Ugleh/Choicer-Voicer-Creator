export function focusLineView(scene,clip){
  const full=scene.end-scene.start,length=clip.end-clip.start;
  const span=Math.min(full,Math.max(6,length*3,full/64));
  const start=Math.max(0,Math.min(full-span,(clip.start+clip.end-span)/2));
  return {zoom:full/span,pan:full>span?start/(full-span):0};
}
