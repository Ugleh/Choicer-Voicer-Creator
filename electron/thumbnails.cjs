const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {MediaEngine,exists}=require('./media.cjs');

// One background decoder at a time. A new viewport supersedes unfinished work.
class TimelineThumbnails {
  constructor(cache,settings){this.cache=cache;this.engine=new MediaEngine(cache,settings);this.generation=0;this.pending=Promise.resolve();}
  cancel(){this.generation++;this.engine.cancel();}
  request(media,start,end,count){
    if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>media.duration+.001||!Number.isInteger(count)||count<1||count>24)throw new Error('Invalid timeline picture range.');
    this.cancel();const generation=this.generation;
    const task=this.pending.catch(()=>{}).then(async()=>{
      if(generation!==this.generation)return null;
      this.engine.reset();
      const stat=await fs.stat(media.preview),fps=media.fps||24;
      const key=crypto.createHash('sha256').update(`${media.preview}:${stat.size}:${stat.mtimeMs}:timeline-v1`).digest('hex').slice(0,24);
      const dir=path.join(this.cache,key);await fs.mkdir(dir,{recursive:true});
      const frames=[];
      for(let i=0;i<count;i++){
        if(generation!==this.generation)return null;
        const at=Math.min(Math.max(0,media.duration-1/fps),start+(end-start)*(i+.5)/count);
        const frame=Math.floor(at*fps),time=frame/fps,file=path.join(dir,`${frame}.jpg`);
        if(!await exists(file)){
          const temp=path.join(dir,`${frame}.partial.jpg`);
          try{
            await this.engine.ff(['-ss',String(time),'-i',media.preview,'-map','0:v:0','-frames:v','1','-vf','scale=200:-2','-q:v','4',temp]);
            if(generation!==this.generation)return null;
            if(!await exists(temp))throw new Error('Could not read this preview frame.');
            await fs.rename(temp,file);
          }finally{await fs.rm(temp,{force:true}).catch(()=>{});}
        }
        frames.push({time,path:file});
      }
      return generation===this.generation?frames:null;
    }).catch(error=>{if(generation!==this.generation)return null;throw error;});
    this.pending=task;return task;
  }
}
module.exports={TimelineThumbnails};
