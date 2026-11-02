import { ChalkEffect } from './chalk';
import { alpha } from './palettes';
import type { DrawFrame, EffectMode } from './types';
const TAU=Math.PI*2;
/** Fixed particle seeds and integrated ember ages; no per-frame particle allocation. */
export class CanvasEffects {
 private seeds=Float32Array.from({length:1800},(_,i)=>{const x=Math.sin(i*127.1+31.7)*43758.5453;return x-Math.floor(x);});
 private emberAges=Float64Array.from({length:100},(_,i)=>this.seeds[i*6]);
 private chalk:ChalkEffect|undefined;
 dispose(){this.chalk?.dispose();}
 status(mode:EffectMode){return mode==="chalk"?this.chalk?.status()??null:null;}
 draw(mode:EffectMode,f:DrawFrame,gpu:boolean){
  const {ctx:c,width:w,height:h,palette:p,signals:s,time:t,intensity:k,reduced}=f;
  c.clearRect(0,0,w,h);
  if(!gpu){c.fillStyle='#080b11';c.fillRect(0,0,w,h);const g=c.createRadialGradient(w*.5,h*.6,0,w*.5,h*.5,w*.7);g.addColorStop(0,alpha(p[1],.14+s.rms*.12));g.addColorStop(1,alpha(p[0],0));c.fillStyle=g;c.fillRect(0,0,w,h);}
  if(mode==='spectrum')this.spectrum(f);
  if(mode==='wave')this.wave(f);
  if(mode==='fire'){
   if(!gpu)this.flames(f);
   c.globalCompositeOperation='lighter';for(let i=0;i<100*f.quality;i++){const n=i*6;const speed=.04+this.seeds[n+1]*.1+s.mids*.08*k;if(!reduced&&s.live)this.emberAges[i]=(this.emberAges[i]+Math.min(.1,Math.max(0,f.dt))*speed)%1;const age=this.emberAges[i];const x=w*(.5+(this.seeds[n+2]-.5)*(.7-age*.25)+Math.sin(age*9+t*.3+this.seeds[n+3]*8)*.03);const y=h*(1-age);this.dot(c,x,y,.6+this.seeds[n+4]*1.4,p[i%3],Math.sin(age*Math.PI)*(.3+s.treble*k*.5));}c.globalCompositeOperation='source-over';
  }
  if(mode==='chalk'){this.chalk??=new ChalkEffect();this.chalk.draw(f);}
 }
 private dot(c:CanvasRenderingContext2D,x:number,y:number,r:number,colour:string,a:number){c.globalAlpha=Math.min(1,a);c.fillStyle=colour;c.beginPath();c.arc(x,y,r,0,TAU);c.fill();c.globalAlpha=1;}
 private spectrum(f:DrawFrame){const {ctx:c,width:w,height:h,palette:p,signals:s,intensity:k}=f;const count=64,gap=w*.004,bar=(w*.87/count)-gap,base=h*.72;const g=c.createLinearGradient(0,h*.1,0,base);g.addColorStop(0,p[2]);g.addColorStop(.45,p[0]);g.addColorStop(1,alpha(p[1],.45));c.fillStyle=g;c.shadowColor=alpha(p[0],.35);c.shadowBlur=9;for(let i=0;i<count;i++){const v=s.spectrum[i];const height=Math.min(h*.58,2+Math.pow(v,1.7)*h*.57*k*(1.15-i/count*.3));const x=w*.065+i*(bar+gap);c.globalAlpha=.75+v*.25;c.fillRect(x,base-height,bar,height);c.globalAlpha=.16;c.fillRect(x,base+5,bar,height*.24);}c.globalAlpha=1;c.shadowBlur=0;const line=c.createLinearGradient(0,0,w,0);line.addColorStop(0,alpha(p[0],0));line.addColorStop(.5,alpha(p[0],.35));line.addColorStop(1,alpha(p[0],0));c.fillStyle=line;c.fillRect(w*.04,base+2,w*.92,1);}
 private wave(f:DrawFrame){const {ctx:c,width:w,height:h,palette:p,signals:s,time:t,intensity:k}=f;c.globalCompositeOperation='lighter';for(let layer=5;layer>=0;layer--){const points=100;const base=h*(.5+layer*.017);const amp=h*(.012+s.bass*.17*k)*(1-layer*.09);c.beginPath();for(let j=0;j<=points;j++){const u=j/points;const envelope=Math.pow(Math.sin(u*Math.PI),1.2);const sample=s.waveform[Math.min(127,Math.floor(u*127))];const y=base+envelope*(Math.sin(u*TAU*1.4-t*.65+layer*.45)*amp+Math.sin(u*TAU*3.2+t*.3+layer*.4)*s.mids*h*.05*k+sample*h*.13*k);if(j===0)c.moveTo(u*w,y);else c.lineTo(u*w,y);}c.strokeStyle=alpha(p[layer%3],.24+(.7-layer*.1)*s.rms);c.lineWidth=layer===0?1.8:1;c.shadowBlur=layer<2?9:0;c.shadowColor=p[layer%3];c.stroke();c.lineTo(w,h*.76);c.lineTo(0,h*.76);c.closePath();const g=c.createLinearGradient(0,base-amp,0,h*.76);g.addColorStop(0,alpha(p[layer%3],.07));g.addColorStop(1,alpha(p[layer%3],0));c.fillStyle=g;c.fill();}c.shadowBlur=0;c.globalCompositeOperation='source-over';}
 private flames(f:DrawFrame){const {ctx:c,width:w,height:h,signals:s,palette:p,time:t,intensity:k}=f;for(let i=0;i<28;i++){const x=w*(.15+i/40),height=h*(.2+s.bass*k*.5)*(.5+this.seeds[i]*.5);const bend=Math.sin(t*.8+i*2)*w*.04;const g=c.createLinearGradient(x,h,x,h-height);g.addColorStop(0,alpha(p[2],.25));g.addColorStop(.3,alpha(p[0],.18));g.addColorStop(1,alpha(p[1],0));c.fillStyle=g;c.beginPath();c.moveTo(x-w*.07,h);c.bezierCurveTo(x-w*.08,h-height*.4,x+bend,h-height*.5,x+bend,h-height);c.bezierCurveTo(x+w*.1,h-height*.4,x+w*.08,h,x+w*.07,h);c.fill();}}
}
