/** Butterchurn2 external-PCM integration: no AudioContext, source node or audio output. */
import type butterchurn from 'butterchurn';
import {renderSize} from './render-quality';
type Visualizer=ReturnType<typeof butterchurn.createVisualizer>;
let previousOpening=-1;
/** Random first preset; reopening Retro cannot start with the same one twice. */
export function chooseStartingPreset(count:number,random:()=>number=Math.random){
 if(count<=1)return 0;
 const choice=previousOpening<0?Math.floor(random()*count):(previousOpening+1+Math.floor(random()*(count-1)))%count;
 previousOpening=choice;
 return choice;
}
export class PresetClock {
 index=0;elapsed=0;
 step(dt:number,playing:boolean,count:number){if(!playing)return false;this.elapsed+=Math.min(.1,Math.max(0,dt));if(this.elapsed<45)return false;this.elapsed=0;this.index=(this.index+1)%count;return true;}
}
export class RetroRenderer {
 private canvas:HTMLCanvasElement;private gl:WebGL2RenderingContext|null=null;private visualizer:Visualizer|undefined;private dead=false;private failed=false;private width=1;private height=1;private clock=new PresetClock();private presets:{name:string;preset:object}[]=[];private rendered=false;private quality=1;
 constructor(host:HTMLCanvasElement,private diagnostic:(message:string|null)=>void){
  this.canvas=document.createElement('canvas');this.canvas.setAttribute('aria-hidden','true');host.parentElement?.insertBefore(this.canvas,host);this.diagnostic('Loading Retro…');void this.load();
 }
 private async load(){try{
  const [module,presets]=await Promise.all([import('butterchurn'),import('./retro-presets')]);if(this.dead)return;
  this.gl=this.canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,premultipliedAlpha:false});if(!this.gl)throw new Error('WebGL2 unavailable');
  this.presets=presets.retroPresets;
  this.clock.index=chooseStartingPreset(this.presets.length);
  this.visualizer=module.default.createVisualizer(null,this.canvas,this.options());this.visualizer.loadPreset(this.presets[this.clock.index].preset,0);this.diagnostic(null);
 }catch{if(!this.dead){this.failed=true;this.diagnostic('Retro needs WebGL2. Showing Spectrum; playback is unaffected.');this.release();}}}
 private options(){const output=renderSize(this.width,this.height,window.devicePixelRatio||1,this.quality,'retro');return {width:output.width,height:output.height,pixelRatio:1,textureRatio:Math.min(1,Math.sqrt(1920*1080/(output.width*output.height))),meshWidth:48,meshHeight:36,outputFXAA:false};}
 resize(width:number,height:number,quality:number){if(this.width===width&&this.height===height&&this.quality===quality)return;this.width=width;this.height=height;this.quality=quality;const options=this.options();this.canvas.width=options.width;this.canvas.height=options.height;if(this.visualizer)this.visualizer.setRendererSize(options.width,options.height,options);}
 draw(dt:number,playing:boolean,pcm:Uint8Array){if(this.failed||!this.visualizer)return false;
  try{if(this.gl?.isContextLost())throw new Error('Context lost');if(this.clock.step(dt,playing,this.presets.length))this.visualizer.loadPreset(this.presets[this.clock.index].preset,5);
   if(playing||!this.rendered){this.visualizer.render({elapsedTime:Math.max(.001,Math.min(.1,dt)),audioLevels:{timeByteArray:pcm,timeByteArrayL:pcm,timeByteArrayR:pcm}});this.rendered=true;}return true;
  }catch{this.failed=true;this.diagnostic('Retro graphics stopped. Showing Spectrum; switch effects to retry.');this.release();return false;}
 }
 private release(){this.visualizer=undefined;this.gl?.getExtension('WEBGL_lose_context')?.loseContext();this.gl=null;this.canvas.remove();this.canvas.width=this.canvas.height=1;}
 dispose(){this.dead=true;this.release();}
}
