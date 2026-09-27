const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const { clipName, clipIni, packIni, packName, validateScene, id } = require('./core.cjs');
const { normalizeExecutablePath } = require('./tool-paths.cjs');
const { ffmpegProgress } = require('./progress.cjs');
const { collectionPlan } = require('./collection.cjs');
const {lineRange}=require('../shared/line-range.mjs');
const {mixBacking}=require('./sound-effects.cjs');

class MediaEngine {
  constructor(cache, settings, progress = () => {}) { this.cache = cache; this.settings = settings; this.progress = progress; this.children = new Set(); this.cancelled = false; }
  cancel() { this.cancelled = true; for (const child of this.children) child.kill(); }
  reset() { this.cancelled = false; }
  binary(name) { return normalizeExecutablePath(this.settings()[`${name}Path`]) || name; }
  run(name, args, { duration = 0, label = name, detail, onData } = {}) {
    if (this.cancelled) return Promise.reject(new Error('Operation cancelled.'));
    return new Promise((resolve, reject) => {
      const executable = this.binary(name);
      const child = spawn(executable, args, { windowsHide: true, shell: false });
      this.children.add(child);
      let output = '', errors = '';
      const readProgress = duration && !onData ? ffmpegProgress({ duration, label, detail, emit: this.progress }) : null;
      if (readProgress) this.progress({ label, detail, percent: null, totalSeconds: duration });
      child.stdout.on('data', data => {
        if (onData) return onData(data);
        output = (output + data.toString()).slice(-8_000_000);
        readProgress?.(data);
      });
      child.stderr.on('data', data => { errors = (errors + data.toString()).slice(-12000); });
      child.on('error', err => {
        this.children.delete(child);
        const detail = err.code === 'ENOENT'
          ? `${name} was not found: ${JSON.stringify(executable)}. Choose ${name}.exe in Settings, or leave its path blank to use PATH.`
          : `${name} could not start at ${JSON.stringify(executable)}. ${err.message}`;
        reject(new Error(detail));
      });
      child.on('close', code => {
        this.children.delete(child);
        if (this.cancelled) reject(new Error('Operation cancelled.'));
        else if (code !== 0) reject(new Error(`${label} failed: ${errors.slice(-2200)}`));
        else resolve(output);
      });
    });
  }
  async ff(args, opts) { return this.run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-progress', 'pipe:1', ...args], opts); }
  async probe(file) {
    const value = JSON.parse(await this.run('ffprobe', ['-v','error','-show_format','-show_streams','-of','json', file]));
    const video = value.streams.find(s => s.codec_type === 'video' && !s.disposition?.attached_pic);
    const audio = value.streams.filter(s => s.codec_type === 'audio');
    const duration = Number(value.format.duration || video?.duration || audio[0]?.duration);
    if (!Number.isFinite(duration) || duration <= 0) throw new Error('Could not read the media duration.');
    const rate = (video?.avg_frame_rate || '24/1').split('/').map(Number);
    return { duration, width: video?.width, height: video?.height, fps: rate[0] / rate[1] || 24, videoIndex: video?.index, audio: audio.map(a => ({ index: a.index, channels: a.channels, codec: a.codec_name, language: a.tags?.language || '', title: a.tags?.title || '' })), raw: value };
  }
  async check() {
    const output = await this.run('ffmpeg', ['-hide_banner','-encoders']);
    await this.run('ffprobe',['-version']);
    if (!output.includes('libtheora') || !output.includes('libx264') || !output.includes('libvorbis')) throw new Error('FFmpeg needs libtheora, libvorbis and libx264 encoders.');
    return { ok: true };
  }
  async prepare(file, audioIndex) {
    const info = await this.probe(file);
    if (info.videoIndex === undefined || !info.audio.length) throw new Error('Choose a video containing both a video track and an audio track.');
    const chosen = info.audio.find(a=>a.index === audioIndex) || info.audio[0];
    const stat = await fs.stat(file);
    const hash = crypto.createHash('sha256').update(`${file}:${stat.size}:${stat.mtimeMs}:${chosen.index}:v2`).digest('hex').slice(0,24);
    const dir = path.join(this.cache, hash); await fs.mkdir(dir, { recursive: true });
    const preview = path.join(dir, 'preview.mp4'), peaksFile = path.join(dir,'peaks.json');
    if (!await exists(preview)) {
      const temp = path.join(dir,'preview.partial.mp4');
      await this.ff(['-i',file,'-map',`0:${info.videoIndex}`,'-map',`0:${chosen.index}`,'-vf',"scale=w='min(960,iw)':h=-2",'-c:v','libx264','-preset','ultrafast','-crf','27','-pix_fmt','yuv420p','-c:a','aac','-ac','2','-b:a','128k','-movflags','+faststart',temp],{duration: info.duration,label:'Creating video preview',detail:'Step 1 of 3 · Converting the full movie for editing. Long movies can take several minutes; this copy is cached for next time.'});
      await fs.rename(temp,preview);
    }
    let peaks;
    if (await exists(peaksFile)) peaks = JSON.parse(await fs.readFile(peaksFile,'utf8'));
    else {
      const label='Reading the audio waveform',detail='Step 2 of 3 · Scanning the movie’s audio for the timeline.';
      this.progress({label,detail,percent:null});
      const count = Math.min(60000, Math.ceil(info.duration * 100)), bucket = Math.max(1,Math.ceil(info.duration * 4000 / count));
      peaks = []; let peak = 0, used = 0, samples = 0, lastReport = 0, carry = Buffer.alloc(0);
      await this.run('ffmpeg',['-v','error','-nostdin','-i',file,'-map',`0:${chosen.index}`,'-vn','-ac','1','-ar','4000','-f','s16le','pipe:1'],{onData: data => {
        const bytes = carry.length ? Buffer.concat([carry,data]) : data;
        samples += Math.floor(bytes.length / 2);
        for (let i=0;i+1<bytes.length;i+=2) { peak=Math.max(peak,Math.abs(bytes.readInt16LE(i))/32768); if (++used===bucket) { peaks.push(Math.round(peak*1000)/1000);used=0;peak=0; } }
        carry = bytes.length%2 ? bytes.subarray(bytes.length-1) : Buffer.alloc(0);
        if (Date.now()-lastReport>=500) {
          const processedSeconds=Math.min(info.duration,samples/4000);
          this.progress({label,detail,processedSeconds,totalSeconds:info.duration,percent:Math.min(99.9,processedSeconds/info.duration*100)});
          lastReport=Date.now();
        }
      }});
      if(used)peaks.push(peak);
      await fs.writeFile(peaksFile,JSON.stringify(peaks));
    }
    this.progress({label:'Generating filmstrip',detail:'Step 3 of 3 · Creating 10 timeline thumbnails.',percent:0});
    const thumbs=[];
    for(let i=0;i<10;i++) {
      const thumb=path.join(dir,`thumb-${i}.jpg`);
      if(!await exists(thumb)) await this.ff(['-ss',String(Math.min(info.duration-0.04,info.duration*i/10)),'-i',preview,'-frames:v','1','-vf','scale=200:-2',thumb]);
      thumbs.push(thumb);
      this.progress({label:'Generating filmstrip',detail:`Step 3 of 3 · ${i+1} of 10 thumbnails ready.`,percent:(i+1)*10});
    }
    return {path:file, name:path.basename(file),duration:info.duration,width:info.width,height:info.height,fps:info.fps,audio:info.audio,audioIndex:chosen.index,videoIndex:info.videoIndex,preview,peaks,thumbs};
  }
  async sceneAudio(media, scene, output) {
    await this.ff(['-ss',String(scene.start),'-i',media.path,'-t',String(scene.end-scene.start),'-map',`0:${media.audioIndex}`,'-vn','-ac','2','-ar','44100','-c:a','pcm_s16le',output],{duration:scene.end-scene.start,label:'Extracting scene audio'});
    return output;
  }
  async normalizeAudio(input, output, duration) {
    const original = await this.probe(input);
    if (Math.abs(original.duration-duration)>0.15) throw new Error('The audio must be trimmed to the exact scene length before importing.');
    await this.ff(['-i',input,'-t',String(duration),'-vn','-ar','48000','-ac','2','-c:a','pcm_s16le',output],{duration,label:'Preparing WAV audio'});
    const info=await this.probe(output);
    if(Math.abs(info.duration-duration)>0.15)throw new Error('The backing track duration does not match the scene. Import audio trimmed to the exact scene boundaries.');
    return info;
  }
  async trimScene(media, scene, start, end) {
    const { planSceneTrim } = await import('./scene-trim.mjs');
    const plan = planSceneTrim(scene, start, end);
    if (plan.start === scene.start && plan.end === scene.end) return scene;
    const result = { ...scene, start: plan.start, end: plan.end, clips: plan.clips, effects:plan.effects };
    if (!scene.backing) return result;
    const backing = scene.backing;
    if (backing.sourceStart !== scene.start || backing.sourceEnd !== scene.end || backing.audioIndex !== media.audioIndex || Math.abs(backing.duration - (scene.end-scene.start)) > .15) {
      throw new Error('The backing track does not match the current scene. Import or generate a matching track before trimming.');
    }
    const dir = path.join(this.cache, 'scene-trims', id());
    await fs.mkdir(dir, { recursive: true });
    const outputs = [];
    try {
      const trimmed = { ...backing, duration: plan.duration, sourceStart: plan.start, sourceEnd: plan.end };
      delete trimmed.url; delete trimmed.vocalsUrl;
      for (const [key, name] of [['path','backing.wav'], ['vocalsPath','vocals.wav']]) {
        if (!backing[key]) continue;
        const info = await this.probe(backing[key]);
        if (Math.abs(info.duration-(scene.end-scene.start)) > .15) throw new Error(`The ${name} audio length does not match the current scene.`);
        const output = path.join(dir, name); outputs.push(output);
        await this.ff(['-i',backing[key],'-map','0:a:0','-vn','-af',`atrim=start=${plan.offset}:duration=${plan.duration},asetpts=PTS-STARTPTS,aresample=48000,apad,atrim=duration=${plan.duration}`,'-ar','48000','-c:a','pcm_s16le',output], {duration:plan.duration,label:`Trimming ${name}`});
        const written = await this.probe(output);
        if (Math.abs(written.duration-plan.duration) > .001 || written.raw.streams[0]?.codec_name !== 'pcm_s16le') throw new Error(`Could not verify trimmed ${name}.`);
        trimmed[key] = output;
      }
      if (this.cancelled) throw new Error('Operation cancelled.');
      return { ...result, backing: trimmed };
    } catch (error) {
      for (const file of outputs) await fs.rm(file, { force: true }).catch(()=>{});
      await fs.rmdir(dir).catch(()=>{});
      throw error;
    }
  }
  async writeDialogue(media, scene, clip, output, lineNumber = 1, total = 1) {
    clip=lineRange(scene,clip);
    const vocals = scene.backing?.vocalsPath;
    const seek = vocals ? clip.start : scene.start + clip.start;
    const duration = clip.end - clip.start, sampleCount = Math.round(duration * 48000);
    const args = ['-ss',String(seek),'-i',vocals || media.path,'-map',vocals ? '0:a:0' : `0:${media.audioIndex}`,'-vn','-ac','1','-ar','48000','-c:a','pcm_s16le'];
    const filters = [`atrim=duration=${duration}`, 'asetpts=PTS-STARTPTS'];
    if (scene.normalize !== false) filters.push('loudnorm=I=-16:TP=-1.5:LRA=11');
    // loudnorm can emit discontinuous timestamps even when every audio sample
    // is present. Rebuild the clock before bounding the output by sample count.
    filters.push('aresample=48000', 'asetpts=N/SR/TB', `apad=whole_len=${sampleCount}`, `atrim=end_sample=${sampleCount}`);
    await this.ff([...args,'-af',filters.join(','),output], {label:`Writing line ${lineNumber}/${total}`});
    const written = await this.probe(output), audio = written.raw.streams.find(s => s.codec_type === 'audio');
    if (audio?.codec_name !== 'pcm_s16le' || Number(audio.sample_rate) !== 48000 || audio.channels !== 1 || Math.abs(written.duration-duration) > .01) {
      throw new Error(`Export verification failed for line ${lineNumber} in "${scene.name}" (${clip.character}: ${clip.caption}). Expected ${(sampleCount/48000).toFixed(3)}s, mono PCM WAV at 48000 Hz; got ${written.duration.toFixed(3)}s, ${audio?.codec_name || 'no audio'}, ${audio?.channels ?? 0} channel(s) at ${audio?.sample_rate || 'unknown'} Hz.`);
    }
    return written;
  }
  async exportCollection(project, root) {
    const plan=collectionPlan(project),dest=path.join(root,plan.name);
    if (await exists(dest)) throw new Error(`A pack named ${plan.name} already exists. Choose a different destination or rename the collection.`);
    const stage=path.join(root,`.creator-${id()}`),work=path.join(stage,'_work');
    const removeWork=async()=>{if(path.dirname(path.resolve(work))!==path.resolve(stage)||path.basename(work)!=='_work')throw new Error('Invalid export work directory.');await fs.rm(work,{recursive:true,force:true});};
    const removeStage=async()=>{if(path.dirname(path.resolve(stage))!==path.resolve(root)||!/^\.creator-[\w-]+$/.test(path.basename(stage)))throw new Error('Invalid export staging directory.');await fs.rm(stage,{recursive:true,force:true});};
    await fs.mkdir(work,{recursive:true});
    try {
      // Write dialogue first, so a clip error is found before video encoding.
      for (let i=0;i<plan.lines.length;i++) {
        const {scene,clip,timedClip,lineNumber,total}=plan.lines[i],name=clipName(timedClip,i);
        await this.writeDialogue(project.media,scene,clip,path.join(stage,name+'.wav'),lineNumber,total);
        await fs.writeFile(path.join(stage,name+'.ini'),clipIni(timedClip),'utf8');
        this.progress({label:`Writing collection dialogue ${i+1}/${plan.lines.length}`,percent:(i+1)/plan.lines.length*100});
      }
      const videoList=['ffconcat version 1.0'],backingList=['ffconcat version 1.0'];
      for (let i=0;i<plan.entries.length;i++) {
        const entry=plan.entries[i],{scene,duration,frameCount,sampleCount}=entry;
        if(scene.backing?.path){const backingInfo=await this.probe(scene.backing.path);
        if(Math.abs(backingInfo.duration-duration)>.15)throw new Error(`${scene.name}: backing audio length does not match the scene.`);}
        const stem=`backing-${i}.wav`,segment=`scene-${i}.nut`;
        const audioFilter=`atrim=duration=${duration},aresample=48000,asetpts=N/SR/TB,apad=whole_len=${sampleCount},atrim=end_sample=${sampleCount}`;
        await mixBacking(this,scene,path.join(work,stem),entry.outputDuration);
        // Lossless segments share one format/time base. Round each cut up to a
        // whole video frame, padding its audio by less than a frame if needed.
        const videoFilter=`trim=duration=${duration},setpts=PTS-STARTPTS,fps=${plan.fps},tpad=stop_mode=clone:stop_duration=1,trim=end_frame=${frameCount},setpts=N/(${plan.fps}*TB),scale=w='min(1280,iw)':h=-2,setsar=1`;
        await this.ff(['-ss',String(scene.start),'-t',String(duration),'-i',project.media.path,'-map',`0:${project.media.videoIndex}`,'-map',`0:${project.media.audioIndex}`,'-vf',videoFilter,'-af',audioFilter,'-c:v','ffv1','-pix_fmt','yuv420p','-c:a','pcm_s16le','-ar','48000','-ac','2',path.join(work,segment)],{duration:entry.outputDuration,label:`Preparing scene ${i+1}/${plan.entries.length}: ${scene.name}`});
        videoList.push(`file '${segment}'`,`duration ${entry.outputDuration.toFixed(9)}`);
        backingList.push(`file '${stem}'`);
      }
      const videoManifest=path.join(work,'video.ffconcat'),backingManifest=path.join(work,'backing.ffconcat');
      await fs.writeFile(videoManifest,videoList.join('\n')+'\n','utf8');await fs.writeFile(backingManifest,backingList.join('\n')+'\n','utf8');
      await this.ff(['-f','concat','-safe','1','-i',backingManifest,'-map','0:a:0','-af',`asetpts=N/SR/TB,atrim=end_sample=${plan.samples}`,'-c:a','pcm_s16le','-ar','48000','-ac','2',path.join(stage,'_backing_track.wav')],{duration:plan.duration,label:'Joining collection backing tracks'});
      await this.ff(['-f','concat','-safe','1','-i',videoManifest,'-map','0:v:0','-map','0:a:0','-vf',`setpts=N/(${plan.fps}*TB)`,'-af','asetpts=N/SR/TB','-c:v','libtheora','-q:v','7','-pix_fmt','yuv420p','-c:a','libvorbis','-q:a','4','-ar','48000','-ac','2',path.join(stage,'dub_video.ogv')],{duration:plan.duration,label:'Encoding combined collection video'});
      const backing=await this.probe(path.join(stage,'_backing_track.wav')),video=await this.probe(path.join(stage,'dub_video.ogv'));
      if(Math.abs(backing.duration-plan.samples/48000)>.001||backing.raw.streams[0]?.codec_name!=='pcm_s16le')throw new Error('Combined backing track verification failed.');
      if(video.raw.streams.find(s=>s.codec_type==='video')?.codec_name!=='theora'||Math.abs(video.duration-plan.duration)>.05)throw new Error(`Combined video verification failed: expected ${plan.duration.toFixed(3)}s, got ${video.duration.toFixed(3)}s.`);
      await fs.writeFile(path.join(stage,'_pack_info.ini'),packIni(project,{description:project.description},plan.title),'utf8');
      if(project.author)await fs.writeFile(path.join(stage,'_author.txt'),project.author,'utf8');
      await fs.writeFile(path.join(stage,'_scene_index.txt'),plan.entries.map((e,i)=>`${i+1}. ${e.scene.name}\r\nStarts at ${e.offset.toFixed(3)} seconds in dub_video.ogv\r\n`).join('\r\n'),'utf8');
      await removeWork();
      await fs.rename(stage,dest);
      return {path:dest,files:await fs.readdir(dest),warnings:plan.warnings,sceneCount:plan.entries.length,lineCount:plan.lines.length,duration:plan.duration};
    } catch(error) {await removeStage();throw error;}
  }
  async exportScene(project, scene, root) {
    const validation=validateScene(scene,project.media);
    if(validation.errors.length)throw new Error(validation.errors.join('\n'));
    const dest=path.join(root,packName(project,scene));
    if(await exists(dest)) throw new Error(`A pack named ${path.basename(dest)} already exists. Choose a different destination or rename the scene.`);
    const stage=path.join(root,`.creator-${id()}`);await fs.mkdir(stage,{recursive:true});
    const duration=scene.end-scene.start;
    try {
      await mixBacking(this,scene,path.join(stage,'_backing_track.wav'));
      // Keep original audio in the video for the game's original-scene preview.
      // Dub playback uses the separate backing track and player recordings.
      await this.ff(['-ss',String(scene.start),'-i',project.media.path,'-t',String(duration),'-map',`0:${project.media.videoIndex}`,'-map',`0:${project.media.audioIndex}`,'-vf',"scale=w='min(1280,iw)':h=-2",'-c:v','libtheora','-q:v','7','-pix_fmt','yuv420p','-c:a','libvorbis','-q:a','4','-ac','2',path.join(stage,'dub_video.ogv')],{duration,label:`Encoding ${scene.name}`});
      const clips=[...scene.clips].sort((a,b)=>a.start-b.start);
      for(let i=0;i<clips.length;i++){
        const clip=clips[i],name=clipName(clip,i);
        await this.writeDialogue(project.media,scene,clip,path.join(stage,`${name}.wav`),i+1,clips.length);
        await fs.writeFile(path.join(stage,`${name}.ini`),clipIni(lineRange(scene,clip)),'utf8');
        this.progress({label:`Writing dialogue ${i+1}/${clips.length}`,percent:(i+1)/clips.length*100});
      }
      await fs.writeFile(path.join(stage,'_pack_info.ini'),packIni(project,scene),'utf8');
      if(project.author)await fs.writeFile(path.join(stage,'_author.txt'),project.author,'utf8');
      const video=await this.probe(path.join(stage,'dub_video.ogv'));
      if(video.raw.streams.find(s=>s.codec_type==='video')?.codec_name!=='theora')throw new Error('Export verification failed: expected Theora video.');
      if(Math.abs(video.duration-duration)>0.25)throw new Error('Export verification failed: video duration mismatch.');
      await fs.rename(stage,dest);
      return {path:dest,files:await fs.readdir(dest),warnings:validation.warnings};
    } catch(error) { await fs.rm(stage,{recursive:true,force:true}); throw error; }
  }
}
async function exists(file) { try { await fs.access(file);return true; } catch{return false;} }
module.exports={MediaEngine,exists};
