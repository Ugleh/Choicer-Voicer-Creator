const {safeName,validateScene,round,collectionTitle}=require('./core.cjs');
const {lineRange}=require('../shared/line-range.mjs');

function collectionPlan(project) {
  if (!project.media || !project.scenes?.length) throw new Error('Add at least one scene to export the collection.');
  const scenes=project.scenes.filter(scene=>scene.excludeFromCollection!==true);
  if (!scenes.length) throw new Error('Enable at least one scene for collection export.');
  const fps=Number.isFinite(project.media.fps)&&project.media.fps>0?project.media.fps:24;
  let frames=0,samples=0;
  const entries=[],lines=[],warnings=[];
  for (const scene of scenes) {
    const validation=validateScene(scene,project.media);
    if (validation.errors.length) throw new Error(`${scene.name}: ${validation.errors.join(' ')}`);
    warnings.push(...validation.warnings.map(w=>`${scene.name}: ${w}`));
    const duration=scene.end-scene.start,frameCount=Math.max(1,Math.ceil(duration*fps-1e-7)),offset=frames/fps;
    frames+=frameCount;
    const endSamples=Math.round(frames/fps*48000),sampleCount=endSamples-samples;
    entries.push({scene,duration,frameCount,offset,outputDuration:frameCount/fps,sampleCount});
    const clips=[...scene.clips].sort((a,b)=>a.start-b.start);
    for (let i=0;i<clips.length;i++) {
      const clip=clips[i],padded=lineRange(scene,clip);
      lines.push({scene,clip,lineNumber:i+1,total:clips.length,timedClip:{...padded,start:round(offset+padded.start),end:round(offset+padded.end)}});
    }
    samples=endSamples;
  }
  return {name:safeName(collectionTitle(project)),title:collectionTitle(project),fps,frames,samples,duration:frames/fps,entries,lines,warnings};
}
module.exports={collectionPlan};
