const fs = require('node:fs/promises');
const path = require('node:path');
const AdmZip = require('adm-zip');
const { id, transcriptToClips } = require('./core.cjs');
const {estimateUsage} = require('../shared/pricing.mjs');

class ElevenLabs {
  constructor({ engine, workspace, getKey, settings, record, progress, fetchImpl = fetch }) { Object.assign(this,{engine,workspace,getKey,settings,record,progress,fetchImpl}); }
  cancel() { this.controller?.abort(); }
  async run(kind, media, scene) {
    const key = this.getKey();
    if(!key)throw new Error('Add an ElevenLabs API key in Settings first.');
    const duration=scene.end-scene.start;
    if(!Number.isFinite(duration)||duration<0.1||duration>600)throw new Error('AI jobs support scenes from 0.1 seconds to 10 minutes. Split longer scenes first.');
    const job={id:id(),time:new Date().toISOString(),provider:'ElevenLabs',kind,scene:scene.name,seconds:duration,status:'preparing',estimatedUsd:null,actualUsd:null,requestId:null};
    Object.assign(job,estimateUsage(this.settings(),kind,duration));
    const dir=path.join(this.workspace,job.id); await fs.mkdir(dir,{recursive:true});
    let sent=false;
    try {
      const input=await this.engine.sceneAudio(media,scene,path.join(dir,'input.wav'));
      const form=new FormData();form.append('file',new Blob([await fs.readFile(input)],{type:'audio/wav'}),'scene.wav');
      let endpoint;
      if(kind==='transcribe') {
        endpoint='speech-to-text';form.append('model_id','scribe_v2');form.append('timestamps_granularity','word');form.append('diarize','true');form.append('tag_audio_events','false');
      } else if(kind==='separate') {endpoint='music/stem-separation?output_format=mp3_44100_128';form.append('stem_variation_id','two_stems_v1');}
      else throw new Error('Unknown AI operation.');
      this.controller=new AbortController();
      if(this.engine.cancelled)throw new Error('Operation cancelled before upload.');
      job.status='submitted';await this.record(job);sent=true;
      this.progress({label:kind==='transcribe'?'ElevenLabs is transcribing this scene':'ElevenLabs is separating vocals and background',percent:null});
      const timeout=setTimeout(()=>this.controller?.abort(),20*60*1000);
      let response;
      try { response=await this.fetchImpl(`https://api.elevenlabs.io/v1/${endpoint}`,{method:'POST',redirect:'error',headers:{'xi-api-key':key},body:form,signal:this.controller.signal}); }
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
        if(vocals){const file=path.join(dir,'vocals'+path.extname(vocals.entryName));await fs.writeFile(file,vocals.getData());vocalsPath=path.join(dir,'vocals.wav');await this.engine.normalizeAudio(file,vocalsPath,duration);}
        result={path:output,vocalsPath,duration:info.duration,sourceStart:scene.start,sourceEnd:scene.end,audioIndex:media.audioIndex,reviewed:false,provider:'ElevenLabs'};
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
