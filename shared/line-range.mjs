export function lineRange(scene,clip){
  const padding=scene.linePadding??0.5;
  const round=value=>Math.round(value*1000)/1000;
  return {...clip,start:round(Math.max(0,clip.start-padding)),end:round(Math.min(scene.end-scene.start,clip.end+padding))};
}
