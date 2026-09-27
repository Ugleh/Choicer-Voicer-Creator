const fs = require('node:fs/promises');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { id, transcriptToClips } = require('./core.cjs');
const {estimateUsage} = require('../shared/pricing.mjs');
const {validateSeparationRange} = require('../shared/sound-effects.mjs');
const {importEffect,patchBacking} = require('./sound-effects.cjs');

class ElevenLabs {
  constructor({ engine, workspace, getKey, settings, record, progress, fetchImpl = fetch }) { Object.assign(this,{engine,workspace,getKey,settings,record,progress,fetchImpl}); }
  cancel() { this.controller?.abort(); }
  async generateChoices(media,scene,options) {
    const effects=[],batchId=id();
    for(let variation=1;variation<=4;variation++) {
      if(this.engine.cancelled)return {effects,error:'Generation cancelled. Completed choices are still available.',requested:4};
      try {
        const effect=await this.run('sound-effect',media,scene,{...options,variation,batchId});
        effects.push({...effect,name:`${effect.name} · ${variation}`,variation});
      } catch(error) {
        // Preserve completed, potentially billed generations; never retry automatically.
        if(!effects.length)throw error;
        return {effects,error:error.message,requested:4};
      }
    }
    return {effects,requested:4};
  }
  async run(kind, media, scene, options = {}) {
    if (!['transcribe','separate','sound-effect'].includes(kind)) throw new Error('Unknown AI operation.');
    const range = kind === 'separate' && options.range ? validateSeparationRange(scene, options.range) : null;
    if(range&&scene.backing.audioIndex!==media.audioIndex)throw new Error('The backing track no longer matches the selected audio track.');
    if (kind === 'sound-effect' && (typeof options.text !== 'string' || !options.text.trim() || options.text.length > 1000 || !Number.isFinite(options.duration) || options.duration < .5 || options.duration > 30)) throw new Error('Describe the sound in 1–1000 characters and choose a duration from 0.5 to 30 seconds.');
    const key = this.getKey();
    if(!key)throw new Error('Add an ElevenLabs API key in Settings first.');
    const duration=kind==='sound-effect'?options.duration:range?range.end-range.start:scene.end-scene.start;
    if(!Number.isFinite(duration)||duration<0.1||duration>600)throw new Error('AI jobs support scenes from 0.1 seconds to 10 minutes. Split longer scenes first.');
    const job={id:id(),time:new Date().toISOString(),provider:'ElevenLabs',kind,scene:scene.name,seconds:duration,status:'preparing',estimatedUsd:null,actualUsd:null,requestId:null};
    if(range)job.range={...range};
    if(kind==='sound-effect'&&options.batchId){job.batchId=options.batchId;job.variation=options.variation;}
    Object.assign(job,estimateUsage(this.settings(),kind,duration));
    const dir=path.join(this.workspace,job.id); await fs.mkdir(dir,{recursive:true});
    let sent=false;
    try {
      const form=new FormData();
      if(kind!=='sound-effect') {
        const sourceMedia=range?.source==='backing'?{...media,path:scene.backing.path,audioIndex:0}:media;
        const sourceScene=range?{...scene,start:(range.source==='backing'?0:scene.start)+range.start,end:(range.source==='backing'?0:scene.start)+range.end}:scene;
        const input=await this.engine.sceneAudio(sourceMedia,sourceScene,path.join(dir,'input.wav'));
        form.append('file',new Blob([await fs.readFile(input)],{type:'audio/wav'}),'scene.wav');
      }
      let endpoint;
      if(kind==='transcribe') {
        endpoint='speech-to-text';form.append('model_id','scribe_v2');form.append('timestamps_granularity','word');form.append('diarize','true');form.append('tag_audio_events','false');
      } else if(kind==='separate') {endpoint='music/stem-separation?output_format=mp3_44100_128';form.append('stem_variation_id','two_stems_v1');}
      else endpoint='sound-generation?output_format=mp3_44100_128';
      this.controller=new AbortController();
      if(this.engine.cancelled)throw new Error('Operation cancelled before upload.');
      job.status='submitted';await this.record(job);sent=true;
      this.progress({label:kind==='transcribe'?'ElevenLabs is transcribing this scene':kind==='sound-effect'?`ElevenLabs is generating sound ${options.variation||1}${options.batchId?' of 4':''}`:'ElevenLabs is separating vocals and background',percent:null});
      const timeout=setTimeout(()=>this.controller?.abort(),20*60*1000);
      let response;
      try { response=await this.fetchImpl(`https://api.elevenlabs.io/v1/${endpoint}`,{method:'POST',redirect:'error',headers:{'xi-api-key':key,...(kind==='sound-effect'?{'Content-Type':'application/json'}:{})},body:kind==='sound-effect'?JSON.stringify({text:options.text.trim(),duration_seconds:duration,model_id:'eleven_text_to_sound_v2',prompt_influence:.3,loop:false}):form,signal:this.controller.signal}); }
      finally {clearTimeout(timeout);}
      job.requestId=response.headers.get('request-id')||response.headers.get('x-request-id');
      job.credits=response.headers.get('character-cost')||null;
      if(!response.ok) {
        job.status='failed';
        throw new Error(`ElevenLabs returned ${response.status}. Check your key permissions, credits, and account plan. ${String(await response.text()).slice(0,700).replaceAll(key,'[redacted]')}`);
      }
      let result;
      if(kind==='transcribe') {
        const transcript=await response.json();
        await fs.writeFile(path.join(dir,'transcript.json'),JSON.stringify(transcript,null,2));
        result={clips:transcriptToClips(transcript,duration),transcriptPath:path.join(dir,'transcript.json')};
        if(!result.clips.length)throw new Error('No timed speech was returned. Existing lines were kept.');
      } else if(kind==='sound-effect') {
        const audio=path.join(dir,'generated.mp3');await fs.writeFile(audio,Buffer.from(await response.arrayBuffer()));
        result={...await importEffect(this.engine,audio,dir),name:options.text.trim().slice(0,60),prompt:options.text.trim(),provider:'ElevenLabs'};
      } else {
        const archive=Buffer.from(await response.arrayBuffer());
        const zip=new AdmZip(archive);
        const entries=zip.getEntries().filter(e=>!e.isDirectory&&/\.(wav|mp3|flac|ogg)$/i.test(e.entryName));
        const instrumental=entries.find(e=>/(instrumental|no[_ -]?vocals|background|accompaniment)/i.test(path.basename(e.entryName)));
        const vocals=entries.find(e=>e!==instrumental&&/vocal/i.test(path.basename(e.entryName)));
        if(!instrumental)throw new Error('The response did not label an instrumental/background stem. No stem was guessed.');
        for(const e of [instrumental,vocals].filter(Boolean))if(e.header.size>512*1024*1024)throw new Error('Stem exceeds the safe extraction size.');
        const original=path.join(dir,'instrumental'+path.extname(instrumental.entryName));await fs.writeFile(original,instrumental.getData());
        const output=path.join(dir,'backing.wav');const info=await this.engine.normalizeAudio(original,output,duration);
        let vocalsPath;
        if(vocals){const file=path.join(dir,'vocals-input'+path.extname(vocals.entryName));await fs.writeFile(file,vocals.getData());vocalsPath=path.join(dir,'vocals.wav');await this.engine.normalizeAudio(file,vocalsPath,duration);}
        result={path:output,vocalsPath,duration:info.duration,sourceStart:scene.start,sourceEnd:scene.end,audioIndex:media.audioIndex,reviewed:false,provider:'ElevenLabs'};
        if(range)result=await patchBacking(this.engine,scene,range,output,path.join(dir,'repaired-backing.wav'));
      }
      job.status='succeeded';await this.record(job);return result;
    } catch(error) {
      if(job.status!=='failed')job.status=sent?'unconfirmed':'cancelled';
      job.message=sent?'The provider may have charged this request. Check the request ID in your provider account.':'Nothing was uploaded.';
      await this.record(job);
      if(error.name==='AbortError')throw new Error('Request cancelled or timed out. ElevenLabs may still process and bill it; no automatic retry was made.');
      throw error;
    } finally {this.controller=null;}
  }
}
module.exports={ElevenLabs};
