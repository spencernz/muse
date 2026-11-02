import {audioAnalyzer} from './audio-analyzer';
import {AtmosphericRenderer} from './gpu';
import {CanvasEffects} from './effects';
import {RetroRenderer} from './retro';
import {renderSize} from './render-quality';
import type {Palette,VisualPreferences} from './types';
export class VisualizerEngine {
 private fade=1;private frame=0;private last=0;private time=0;private quality=1;private slow=0;private fast=0;private gpu:AtmosphericRenderer|undefined;private gpuFailed=false;private retro:RetroRenderer|undefined;private effects=new CanvasEffects();private context:CanvasRenderingContext2D;private observer:ResizeObserver;private width=1;private height=1;private destroyed=false;private message:string|null=null;
 constructor(private canvas:HTMLCanvasElement,private atmosphere:HTMLCanvasElement,private preferences:VisualPreferences,private palette:Palette,private reduced:boolean,private fallback:()=>void,private diagnostic:(message:string|null)=>void=()=>{}){
  const context=canvas.getContext('2d',{alpha:true});if(!context)throw new Error('Canvas unavailable');this.context=context;
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);this.resize();this.frame=requestAnimationFrame(this.draw);
 }
 private report=(message:string|null)=>{if(this.message!==message){this.message=message;this.diagnostic(message);}};
 update(preferences:VisualPreferences,palette:Palette,reduced:boolean){const changed=preferences.effect!==this.preferences.effect;if(changed&&!reduced)this.fade=0;
  if(changed||reduced!==this.reduced){this.retro?.dispose();this.retro=undefined;this.report(null);}
  this.preferences=preferences;this.palette=palette;this.reduced=reduced;if(changed){this.effects.dispose();this.effects=new CanvasEffects();this.quality=1;this.slow=this.fast=0;this.resize();}
 }
 private resize(){const bounds=this.canvas.getBoundingClientRect();this.width=Math.max(1,bounds.width);this.height=Math.max(1,bounds.height);const size=renderSize(this.width,this.height,window.devicePixelRatio||1,this.quality,this.preferences.effect);this.canvas.width=size.width;this.canvas.height=size.height;this.context.setTransform(size.ratio,0,0,size.ratio,0,0);this.context.imageSmoothingEnabled=true;this.context.imageSmoothingQuality='high';
  const fire=this.preferences.effect==='fire';this.atmosphere.width=fire?size.width:1;this.atmosphere.height=fire?size.height:1;this.retro?.resize(this.width,this.height,this.quality);
 }
 private draw=(now:number)=>{
  if(this.destroyed)return;this.frame=requestAnimationFrame(this.draw);const signal=audioAnalyzer.processor.signals,effect=this.preferences.effect;const ambient=effect==='chalk';const minFrame=this.reduced?80:(signal.live||ambient)?15:100;
  if(now-this.last<minFrame)return;const dt=Math.min(.1,(now-this.last)/1000||.016);this.last=now;audioAnalyzer.processor.step(dt);if(!this.reduced&&signal.live)this.time+=dt;
  this.fade=Math.min(1,this.fade+dt*7);this.canvas.style.opacity=String(this.fade);this.atmosphere.style.opacity=String(this.fade);
  const start=performance.now(),atmospheric=effect==='fire';
  if(atmospheric&&!this.gpu&&!this.gpuFailed){try{this.gpu=new AtmosphericRenderer(this.atmosphere);}catch{this.gpuFailed=true;this.fallback();}}
  let gpu=atmospheric&&!!this.gpu;this.atmosphere.style.visibility=gpu?'visible':'hidden';
  if(gpu){try{this.gpu!.draw(effect,this.time,signal,this.palette,this.preferences.intensity,this.reduced);}catch{this.gpu?.dispose();this.gpu=undefined;this.gpuFailed=true;gpu=false;this.atmosphere.style.visibility='hidden';this.fallback();}}
  let retro=false;
  if(effect==='retro'&&!this.reduced){this.retro??=new RetroRenderer(this.canvas,this.report);this.retro.resize(this.width,this.height,this.quality);retro=this.retro.draw(dt,signal.live,audioAnalyzer.processor.pcm);}
  if(effect==='retro'&&this.reduced)this.report('Reduced motion · calm Spectrum');
  if(retro){this.context.clearRect(0,0,this.width,this.height);}else this.effects.draw(effect==='retro'?'spectrum':effect,{ctx:this.context,width:this.width,height:this.height,time:this.time,dt,signals:signal,palette:this.palette,intensity:effect==='retro'?1:this.preferences.intensity,reduced:this.reduced,quality:this.quality},gpu);
  if(ambient)this.report(this.effects.status(effect));
  const cost=performance.now()-start;
  // Measure both JS draw cost and delivered frames (GPU load can stall the next RAF).
  if(cost>22||(!this.reduced&&(signal.live||ambient)&&dt>.026)){this.fast=0;if(++this.slow>45&&this.quality>.3){this.quality=Math.max(.3,this.quality*.8);this.slow=0;this.resize();}}
  else {this.slow=Math.max(0,this.slow-1);if(cost<9&&dt<.021&&++this.fast>600&&this.quality<1){this.quality=Math.min(1,this.quality*1.1);this.fast=0;this.resize();}}
 };
 dispose(){this.destroyed=true;cancelAnimationFrame(this.frame);this.observer.disconnect();this.gpu?.dispose();this.retro?.dispose();this.effects.dispose();this.canvas.width=this.canvas.height=1;this.atmosphere.width=this.atmosphere.height=1;}
}
