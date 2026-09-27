export function activeSceneLines(scene, sourceTime) {
  if (!scene || sourceTime < scene.start || sourceTime >= scene.end) return [];
  const relative = Math.round((sourceTime-scene.start)*1e6)/1e6;
  return scene.clips.filter(clip => relative >= clip.start && relative < clip.end).sort((a,b) => a.start-b.start);
}

export function previewBounds(media, scene, sourceMode) {
  const start = !sourceMode && scene ? scene.start : 0;
  const end = !sourceMode && scene ? scene.end : media?.duration || 0;
  const frame = 1/(media?.fps || 24);
  return {start,end,lastFrame:Math.max(start,end-frame)};
}
