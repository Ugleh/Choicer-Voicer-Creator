const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const round=n=>Math.round(n*1000)/1000;

export function moveTimelineClip(clip,delta,duration,playhead,tolerance,bypass=false) {
  const length=clip.end-clip.start,max=duration-length;
  let start=clamp(clip.start+delta,0,max);
  if(!bypass&&Number.isFinite(playhead)) {
    // Approach from the left with the end, or from the right with the start.
    const candidates=(delta>=0?[playhead-length,playhead]:[playhead,playhead-length])
      .filter(value=>value>=0&&value<=max&&Math.abs(value-start)<=tolerance)
      .sort((a,b)=>Math.abs(a-start)-Math.abs(b-start));
    if(candidates.length)start=candidates[0];
  }
  return {start:round(start),end:round(start+length)};
}

export function resizeTimelineEdge(value,min,max,playhead,tolerance,bypass=false) {
  const bounded=clamp(value,min,max);
  return round(!bypass&&playhead>=min&&playhead<=max&&Math.abs(bounded-playhead)<=tolerance?playhead:bounded);
}
