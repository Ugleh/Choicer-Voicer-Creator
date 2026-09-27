const { contextBridge, ipcRenderer, webUtils } = require('electron');
const channels=['bootstrap','importVideo','prepareVideo','timelineThumbnails','saveProject','openProject','recoverProject','autosave','importBacking','importEffect','trimScene','exportPack','exportCollection','copyShare','settings','saveSettings','openPricing','runAI','cancel','reveal'];
const api=Object.fromEntries(channels.map(channel=>[channel,async(...args)=>{const result=await ipcRenderer.invoke('cv:'+channel,...args);if(!result.ok)throw new Error(result.error);return result.value;}]));
api.importDroppedVideo=async file=>{
  const filePath=webUtils.getPathForFile(file);
  if(!filePath)throw new Error('Drop a video file from File Explorer. This item is not a local file.');
  const result=await ipcRenderer.invoke('cv:importDroppedVideo',filePath);
  if(!result.ok)throw new Error(result.error);
  return result.value;
};
api.onProgress=callback=>{const listener=(_event,data)=>callback(data);ipcRenderer.on('cv:progress',listener);return()=>ipcRenderer.removeListener('cv:progress',listener);};
for(const channel of ['newProject','editText','windowAction'])api[channel]=async(...args)=>{const result=await ipcRenderer.invoke('cv:'+channel,...args);if(!result.ok)throw new Error(result.error);return result.value;};
api.onMenu=callback=>{const listener=(_event,action)=>callback(action);ipcRenderer.on('cv:menu',listener);return()=>ipcRenderer.removeListener('cv:menu',listener);};
contextBridge.exposeInMainWorld('creator',api);
