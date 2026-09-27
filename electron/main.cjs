const { app, BrowserWindow, ipcMain, dialog, protocol, safeStorage, shell, clipboard }=require('electron');
const fs=require('node:fs/promises');
const {createReadStream}=require('node:fs');
const {Readable}=require('node:stream');
const path=require('node:path');
const {id,validateProject,validateScene,safeName,packName}=require('./core.cjs');
const {MediaEngine,exists}=require('./media.cjs');
const {ElevenLabs}=require('./providers.cjs');
const {normalizeExecutablePath,normalizeToolSettings}=require('./tool-paths.cjs');
const {collectionPlan}=require('./collection.cjs');
const {TimelineThumbnails}=require('./thumbnails.cjs');
const {shareContent}=require('../shared/sharing.mjs');
const {pricingSettings,validatePricing,PRICING_SOURCES}=require('../shared/pricing.mjs');
const {VIDEO_EXTENSIONS,VIDEO_FILE_ERROR,isVideoFile}=require('../shared/video-formats.mjs');
const {importEffect}=require('./sound-effects.cjs');
const {installMenu}=require('./menu.cjs');
if(process.env.CV_TEST_DATA)app.setPath('userData',process.env.CV_TEST_DATA);
protocol.registerSchemesAsPrivileged([{scheme:'cvmedia',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true,corsEnabled:true}}]);
let win,engine,provider,thumbnails,data,settings={},jobs=[],busy=false,projectPath=null,dirty=false;
const preparedMedia=new Map();
const allowed=new Set(),urls=new Map(),reverse=new Map(),revealPaths=new Set();
let saveQueue=Promise.resolve();
const progress=value=>win?.webContents.send('cv:progress',value);
const atomic=async(file,value)=>{const temp=file+'.'+id()+'.tmp';await fs.writeFile(temp,JSON.stringify(value,null,2));await fs.rename(temp,file);};
const queueSave=(file,value)=>{const operation=saveQueue.catch(()=>{}).then(()=>atomic(file,value));saveQueue=operation;return operation;};
function allow(file){if(file)allowed.add(path.resolve(file));return file;}
function requireAllowed(file){if(typeof file!=='string'||!allowed.has(path.resolve(file)))throw new Error('Select this media file through the app first.');}
function mediaURL(file){if(!file)return null;allow(file);if(reverse.has(file))return reverse.get(file);const key=id(),url=`cvmedia://asset/${key}`;urls.set(key,file);reverse.set(file,url);return url;}
function decorateMedia(media){preparedMedia.set(path.resolve(media.path),media);return {...media,previewUrl:mediaURL(media.preview),thumbUrls:(media.thumbs||[]).map(mediaURL)};}
function decorateBacking(backing){return backing?{...backing,url:mediaURL(backing.path),vocalsUrl:mediaURL(backing.vocalsPath)}:null;}
function decorateEffect(effect){allow(effect.path);return {...effect,url:effect.missing?null:mediaURL(effect.path)};}
function placeEffect(effect,scene,start){if(!Number.isFinite(start)||start<0||start>=scene.end-scene.start)throw new Error('Place the sound effect inside the scene.');return decorateEffect({...effect,start,end:Math.min(scene.end-scene.start,start+effect.duration)});}
function cleanProject(project){const result=structuredClone(validateProject(project));if(result.media){delete result.media.previewUrl;delete result.media.thumbUrls;}for(const s of result.scenes){if(s.backing){delete s.backing.url;delete s.backing.vocalsUrl;}for(const e of s.effects||[])delete e.url;}return result;}
function validateAccess(project){validateProject(project);if(project.media)requireAllowed(project.media.path);for(const scene of project.scenes){if(scene.backing?.path)requireAllowed(scene.backing.path);if(scene.backing?.vocalsPath)requireAllowed(scene.backing.vocalsPath);for(const e of scene.effects||[])requireAllowed(e.path);}}
async function useProject(project){validateProject(project);if(project.media){
  if(!await exists(project.media.path)){
    const picked=await dialog.showOpenDialog(win,{title:'Locate the original video',properties:['openFile'],filters:[{name:'Videos',extensions:VIDEO_EXTENSIONS}]});
    if(picked.canceled)throw new Error('Source video not found. Locate it to reopen this project.');
    project.media.path=picked.filePaths[0];for(const scene of project.scenes)scene.backing=null;
  }
  allow(project.media.path);project.media=decorateMedia(await engine.prepare(project.media.path,project.media.audioIndex));
}for(const scene of project.scenes){if(scene.backing?.path && await exists(scene.backing.path)){scene.backing=decorateBacking(scene.backing);scene.backingMissing=false;}else{if(scene.backing?.path)scene.backingMissing=true;scene.backing=null;}scene.effects=await Promise.all((scene.effects||[]).map(async e=>decorateEffect({...e,missing:!await exists(e.path)})));}return project;}
function publicSettings(){return {appVersion:app.getVersion(),appPath:app.isPackaged?process.execPath:app.getAppPath(),ffmpegPath:settings.ffmpegPath||'',ffprobePath:settings.ffprobePath||'',...pricingSettings(settings),hasKey:!!settings.encryptedKey,canStoreKey:safeStorage.isEncryptionAvailable(),jobs};}
function getKey(){if(!settings.encryptedKey)return '';return safeStorage.decryptString(Buffer.from(settings.encryptedKey,'base64'));}
function handle(name,callback,exclusive=false){ipcMain.handle('cv:'+name,async(event,...args)=>{
  if(event.sender!==win?.webContents)return {ok:false,error:'Unknown window.'};
  if(exclusive&&busy)return {ok:false,error:'Wait for the current operation or cancel it first.'};
  if(exclusive){busy=true;thumbnails?.cancel();engine.reset();}
  try{return {ok:true,value:await callback(...args)};}catch(error){return {ok:false,error:error.message};}finally{if(exclusive){busy=false;progress(null);}}
});}
async function confirmDiscard(){if(!dirty)return true;return (await dialog.showMessageBox(win,{type:'question',message:'Open another project?',detail:'The current project has unsaved edits. Cancel to save them first. A recovery snapshot is also kept.',buttons:['Cancel','Continue'],defaultId:0,cancelId:0})).response===1;}
app.whenReady().then(async()=>{
  data=app.getPath('userData');await fs.mkdir(data,{recursive:true});
  try{settings=JSON.parse(await fs.readFile(path.join(data,'settings.json'),'utf8'));}catch{}
  const normalizedSettings=normalizeToolSettings(settings);
  if(normalizedSettings.ffmpegPath!==settings.ffmpegPath||normalizedSettings.ffprobePath!==settings.ffprobePath){
    settings=normalizedSettings;
    await queueSave(path.join(data,'settings.json'),settings);
  }
  try{jobs=JSON.parse(await fs.readFile(path.join(data,'jobs.json'),'utf8'));for(const job of jobs)if(job.status==='submitted')job.status='unconfirmed';}catch{}
  engine=new MediaEngine(path.join(data,'cache'),()=>settings,progress);
  thumbnails=new TimelineThumbnails(path.join(data,'timeline-pictures'),()=>settings);
  provider=new ElevenLabs({engine,workspace:path.join(data,'audio'),settings:()=>settings,getKey,progress,record:async job=>{const i=jobs.findIndex(j=>j.id===job.id);if(i>=0)jobs[i]={...job};else jobs.unshift({...job});await queueSave(path.join(data,'jobs.json'),jobs);}});
  protocol.handle('cvmedia',async request=>{
    const file=urls.get(new URL(request.url).pathname.slice(1));if(!file)return new Response('Not found',{status:404});
    try{
      const stat=await fs.stat(file),range=request.headers.get('range'),mime={'.mp4':'video/mp4','.wav':'audio/wav','.mp3':'audio/mpeg','.jpg':'image/jpeg'}[path.extname(file)]||'application/octet-stream';
      const headers={'Content-Type':mime,'Accept-Ranges':'bytes','Access-Control-Allow-Origin':'*'};
      if(range){const m=/^bytes=(\d+)-(\d*)$/.exec(range);if(!m)return new Response(null,{status:416});const start=+m[1],end=m[2]?Math.min(+m[2],stat.size-1):stat.size-1;
        if(start>end||start>=stat.size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${stat.size}`}});
        return new Response(Readable.toWeb(createReadStream(file,{start,end})),{status:206,headers:{...headers,'Content-Length':String(end-start+1),'Content-Range':`bytes ${start}-${end}/${stat.size}`}});
      }
      return new Response(Readable.toWeb(createReadStream(file)),{headers:{...headers,'Content-Length':String(stat.size)}});
    }catch{return new Response('Media unavailable',{status:404});}
  });
  win=new BrowserWindow({width:1500,height:980,minWidth:1120,minHeight:760,title:`Choicer Voicer Creator v${app.getVersion()}`,backgroundColor:'#111315',autoHideMenuBar:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  installMenu(win);
  handle('newProject',async()=>{await saveQueue;await fs.rm(path.join(data,'recovery.json'),{force:true});projectPath=null;dirty=false;return true;},true);
  handle('editText',async action=>{if(!['undo','redo','cut','copy','paste','delete','selectAll'].includes(action))throw new Error('Unknown editing action.');win.webContents[action]();});
  handle('windowAction',async action=>{if(action==='exit')win.close();else if(action==='fullscreen')win.setFullScreen(!win.isFullScreen());else throw new Error('Unknown window action.');});
  win.on('page-title-updated',event=>event.preventDefault());
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event)=>event.preventDefault());
  win.on('close',event=>{if(busy){event.preventDefault();dialog.showMessageBoxSync(win,{message:'An operation is running. Cancel it before closing.'});return;}if(dirty){const response=dialog.showMessageBoxSync(win,{type:'question',message:'Close with unsaved edits?',detail:'Your last recovery snapshot will be available next time.',buttons:['Keep editing','Close'],defaultId:0,cancelId:0});if(response===0)event.preventDefault();}});
  handle('bootstrap',async()=>{let toolStatus;try{toolStatus=await engine.check();}catch(e){toolStatus={ok:false,error:e.message};}return {settings:publicSettings(),toolStatus,recovery:await exists(path.join(data,'recovery.json'))};});
  async function inspectVideo(file){
    if(typeof file!=='string'||!path.isAbsolute(file)||!isVideoFile(file))throw new Error(VIDEO_FILE_ERROR);
    const stat=await fs.stat(file);
    if(!stat.isFile())throw new Error('Drop a video file, not a folder.');
    const info=await engine.probe(file);
    if(info.videoIndex===undefined||!info.audio.length)throw new Error('Choose a video containing both a video track and an audio track.');
    allow(file);
    return {path:file,...info,raw:undefined};
  }
  handle('importVideo',async()=>{const result=await dialog.showOpenDialog(win,{title:'Import a movie or video',properties:['openFile'],filters:[{name:'Video',extensions:VIDEO_EXTENSIONS}]});if(result.canceled)return null;return inspectVideo(result.filePaths[0]);},true);
  handle('importDroppedVideo',inspectVideo,true);
  handle('prepareVideo',async(file,audioIndex,newCollection=false)=>{requireAllowed(file);const media=decorateMedia(await engine.prepare(file,audioIndex));if(newCollection){projectPath=null;dirty=false;}return media;},true);
  handle('timelineThumbnails',async(file,start,end,count)=>{requireAllowed(file);const media=preparedMedia.get(path.resolve(file));if(!media)throw new Error('Open this video before requesting timeline pictures.');if(busy)return null;const frames=await thumbnails.request(media,start,end,count);return frames?.map(frame=>({time:frame.time,url:mediaURL(frame.path)}))??null;});
  handle('saveProject',async(project,saveAs=false)=>{validateAccess(project);let target=projectPath;if(!target||saveAs){const result=await dialog.showSaveDialog(win,{title:saveAs?'Save collection project as':'Save collection project',defaultPath:projectPath||safeName(project.name)+'.cvcreator',filters:[{name:'Creator project',extensions:['cvcreator']}]});if(result.canceled)return null;target=result.filePath;}await queueSave(target,cleanProject(project));projectPath=target;dirty=false;return target;});
  handle('autosave',async project=>{validateAccess(project);dirty=true;await queueSave(path.join(data,'recovery.json'),cleanProject(project));return true;});
  handle('openProject',async()=>{if(!await confirmDiscard())return null;const result=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'Creator project',extensions:['cvcreator']}]});if(result.canceled)return null;const project=await useProject(JSON.parse(await fs.readFile(result.filePaths[0],'utf8')));projectPath=result.filePaths[0];dirty=false;return project;},true);
  handle('recoverProject',async()=>{if(!await confirmDiscard())return null;projectPath=null;dirty=true;return useProject(JSON.parse(await fs.readFile(path.join(data,'recovery.json'),'utf8')));},true);
  handle('importBacking',async(media,scene)=>{requireAllowed(media.path);const result=await dialog.showOpenDialog(win,{title:'Import dialogue-free audio, trimmed to this scene',properties:['openFile'],filters:[{name:'Audio',extensions:['wav','mp3','flac','ogg']}]});if(result.canceled)return null;const dir=path.join(data,'audio',id());await fs.mkdir(dir,{recursive:true});const output=path.join(dir,'backing.wav');const info=await engine.normalizeAudio(result.filePaths[0],output,scene.end-scene.start);return decorateBacking({path:output,duration:info.duration,sourceStart:scene.start,sourceEnd:scene.end,audioIndex:media.audioIndex,reviewed:false,provider:'Imported'});},true);
  handle('importEffect',async(project,sceneId,start)=>{validateAccess(project);const scene=project.scenes.find(s=>s.id===sceneId);if(!scene||!Number.isFinite(start)||start<0||start>=scene.end-scene.start)throw new Error('Choose a position inside the scene.');if((scene.effects||[]).length>=200)throw new Error('A scene supports up to 200 sound effects.');const picked=await dialog.showOpenDialog(win,{title:'Import a sound effect',properties:['openFile'],filters:[{name:'Audio',extensions:['wav','mp3','flac','ogg','m4a','aac','opus','aiff','aif','wma']}]});if(picked.canceled)return null;return placeEffect(await importEffect(engine,picked.filePaths[0],path.join(data,'audio',id())),scene,start);},true);
  handle('trimScene',async(project,sceneId,start,end)=>{validateAccess(project);const scene=project.scenes.find(s=>s.id===sceneId);if(!scene||!project.media||scene.start<0||scene.end>project.media.duration)throw new Error('Choose a valid scene to trim.');const result=await engine.trimScene(project.media,scene,start,end);return {...result,backing:decorateBacking(result.backing)};},true);
  async function doExport(project,sceneIds){validateAccess(project);const scenes=project.scenes.filter(s=>sceneIds.includes(s.id));if(!scenes.length)throw new Error('No scenes to export.');const names=new Set();for(const scene of scenes){const v=validateScene(scene,project.media);if(v.errors.length)throw new Error(`${scene.name}: ${v.errors.join(' ')}`);const name=packName(project,scene).toLowerCase();if(names.has(name))throw new Error('Scene names must produce unique pack folder names.');names.add(name);}const picked=await dialog.showOpenDialog(win,{title:'Choose packs_voice or another export folder',properties:['openDirectory','createDirectory']});if(picked.canceled)return null;const root=picked.filePaths[0];for(const scene of scenes)if(await exists(path.join(root,packName(project,scene))))throw new Error('One of the pack folders already exists. Choose an empty destination or rename that scene.');const results=[];for(const scene of scenes){const result=await engine.exportScene(project,scene,root);results.push(result);revealPaths.add(result.path);}revealPaths.add(root);return {path:root,packs:results};}
  handle('exportPack',(project,sceneId)=>doExport(project,[sceneId]),true);
  handle('exportCollection',async project=>{validateAccess(project);const plan=collectionPlan(project);const picked=await dialog.showOpenDialog(win,{title:'Choose packs_voice or another folder for the combined collection pack',properties:['openDirectory','createDirectory']});if(picked.canceled)return null;const result=await engine.exportCollection(project,picked.filePaths[0]);revealPaths.add(result.path);return {path:result.path,packs:[result],combined:true,sceneCount:plan.entries.length};},true);
  handle('settings',async()=>publicSettings());
  handle('copyShare',async(project,platform,kind='body',part=0)=>{
    validateAccess(project);const content=shareContent(project,platform);
    if(!['title','body','plain','html'].includes(kind)||!Number.isInteger(part)||part<0||part>=content.parts.length)throw new Error('Choose a valid sharing format and message.');
    const text=kind==='title'?content.title:kind==='html'?content.html:kind==='plain'?content.plain:content.parts[part];
    if(text.length>2000000)throw new Error('This sharing text is too large to copy.');
    if(platform==='gamebanana'&&kind==='body')clipboard.write({text:content.plain,html:content.html});else clipboard.writeText(text);
    return true;
  });
  handle('saveSettings',async value=>{const next={...settings,...validatePricing(value)};for(const name of ['ffmpegPath','ffprobePath'])if(typeof value[name]==='string')next[name]=normalizeExecutablePath(value[name]);if(value.deleteKey)delete next.encryptedKey;else if(value.apiKey){if(!safeStorage.isEncryptionAvailable())throw new Error('OS key encryption is unavailable.');next.encryptedKey=safeStorage.encryptString(value.apiKey.trim()).toString('base64');}await queueSave(path.join(data,'settings.json'),next);settings=next;return publicSettings();});
  handle('openPricing',async source=>{if(!Object.hasOwn(PRICING_SOURCES,source))throw new Error('Unknown pricing source.');await shell.openExternal(PRICING_SOURCES[source]);return true;});
  handle('runAI',async(kind,project,sceneId,options={})=>{validateAccess(project);const scene=project.scenes.find(s=>s.id===sceneId);if(!scene||scene.start<0||scene.end>project.media.duration||scene.end<=scene.start)throw new Error('Set valid scene boundaries first.');if(!['separate','transcribe','sound-effect'].includes(kind))throw new Error('Unknown AI operation.');if(kind==='sound-effect'&&((scene.effects||[]).length>=200||!Number.isFinite(options.start)||options.start<0||options.start>=scene.end-scene.start))throw new Error('Choose a position inside the scene, with fewer than 200 effects.');if(kind==='sound-effect'){const result=await provider.generateChoices(project.media,scene,options);return {...result,effects:result.effects.map(effect=>placeEffect(effect,scene,options.start))};}const result=await provider.run(kind,project.media,scene,options);return kind==='separate'?decorateBacking(result):result;},true);
  handle('cancel',async()=>{engine.cancel();provider.cancel();return true;});
  handle('reveal',async target=>{if(!revealPaths.has(target))throw new Error('Export a pack before opening its folder.');return shell.openPath(target);});
  if(process.env.CV_DEV)await win.loadURL('http://127.0.0.1:5173');else await win.loadFile(path.join(__dirname,'../dist/index.html'));
});
app.on('window-all-closed',()=>{engine?.cancel();provider?.cancel();thumbnails?.cancel();app.quit();});
