import type {DrawFrame} from './types';
import {ArtworkTextures,type ArtworkTextureSource} from './artwork-textures';
const TAU=Math.PI*2;
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
type Pal={active:boolean;slot:number;x:number;y:number;age:number;life:number;variant:number;phase:number;spring:number;velocity:number;pawClock:number;side:number;dustClock:number};
type Mark={active:boolean;x:number;y:number;age:number;life:number;angle:number;size:number;vx:number;vy:number};
export class ChalkEffect {
 private pals:Pal[]=Array.from({length:12},()=>({active:false,slot:0,x:0,y:0,age:0,life:0,variant:0,phase:0,spring:0,velocity:0,pawClock:0,side:1,dustClock:0}));
 private paws:Mark[]=Array.from({length:100},()=>({active:false,x:0,y:0,age:0,life:0,angle:0,size:0,vx:0,vy:0}));
 private dust:Mark[]=Array.from({length:200},()=>({active:false,x:0,y:0,age:0,life:0,angle:0,size:0,vx:0,vy:0}));
 private time=0;private lastBeat=-10;private energy=0;private seed=731;private spawn=0;private serial=0;private paw:HTMLCanvasElement|undefined;private board:HTMLCanvasElement|undefined;
 constructor(private textures:ArtworkTextureSource=new ArtworkTextures(['dog','cat','rabbit','fox','lion','elephant','giraffe','panda','penguin','koala','monkey','owl'].map(name=>`/visualizers/chalk-pals/${name}.png`),1)){}
 private random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
 status(){return this.textures.status?.()??null;}
 snapshot(){return {pals:this.pals.filter(p=>p.active).length,paws:this.paws.filter(p=>p.active).length,dust:this.dust.filter(p=>p.active).length,springs:this.pals.map(p=>p.spring),variants:this.pals.filter(p=>p.active).map(p=>p.variant)};}
 private stamps(){if(this.paw)return;this.paw=document.createElement('canvas');this.paw.width=this.paw.height=128;const c=this.paw.getContext('2d');if(!c)return;c.fillStyle='#e7c8b1';c.beginPath();c.ellipse(64,84,28,23,0,0,TAU);c.fill();for(let i=0;i<4;i++){c.beginPath();c.ellipse(26+i*25,40-Math.sin(i/3*Math.PI)*14,11,15,(i-1.5)*.2,0,TAU);c.fill();}c.globalCompositeOperation='destination-out';for(let i=0;i<3500;i++){c.globalAlpha=.2+this.random()*.6;c.fillRect(this.random()*128,this.random()*128,.4+this.random()*1.6,.4+this.random()*1.6);}c.globalCompositeOperation='source-over';c.globalAlpha=1;
 this.board=document.createElement('canvas');this.board.width=this.board.height=256;const b=this.board.getContext('2d');if(b){b.fillStyle='#fff';for(let i=0;i<6000;i++){b.globalAlpha=this.random()*.045;b.fillRect(this.random()*256,this.random()*256,1,1);}}}
 draw(f:DrawFrame){const {ctx:c,width:w,height:h,signals:s,reduced}=f,dt=Math.min(.05,Math.max(0,f.dt)),motion=reduced?.05:1;this.stamps();this.time+=dt;this.spawn+=dt;this.energy+=( (s.live?s.rms*.6+s.bass*.4:0)-this.energy)*(1-Math.exp(-dt/2));
 const scale=Math.max(.65,Math.min(2.4,Math.sqrt(w*h/(1080*640)))),size=132*scale;
 const target=Math.min(reduced?4:12,Math.max(6,Math.round(6+3*Math.log2(Math.max(1,w*h/(1080*640)))+this.energy*2)));
 if(this.pals.filter(p=>p.active).length<target&&this.spawn>.85){const p=this.pals.find(p=>!p.active)!;const slot=Array.from({length:12},(_,i)=>i).find(i=>!this.pals.some(other=>other.active&&other.slot===i))??0;p.active=true;p.slot=slot;p.x=.13+(slot%4)*.245;p.y=.18+Math.floor(slot/4)*.32;p.age=0;p.life=28+this.random()*18;p.variant=this.serial++%12;p.phase=this.random()*TAU;p.spring=p.velocity=0;p.pawClock=0;p.dustClock=0;this.spawn=0;}
 if(!reduced&&s.live&&s.onset>.42&&s.transient>.6&&this.time-this.lastBeat>.55){this.lastBeat=this.time;for(const p of this.pals)if(p.active)p.velocity-=1.7+s.onset*.9;}
 c.fillStyle='#151819';c.fillRect(0,0,w,h);if(this.board){const pattern=c.createPattern(this.board,'repeat');if(pattern){c.fillStyle=pattern;c.fillRect(0,0,w,h);}}
 const g=c.createRadialGradient(w*.5,h*.45,0,w*.5,h*.5,Math.max(w,h)*.7);g.addColorStop(0,'#7380830c');g.addColorStop(1,'#00000055');c.fillStyle=g;c.fillRect(0,0,w,h);
 for(const p of this.pals){if(!p.active)continue;p.age+=dt;p.pawClock+=dt;p.dustClock+=dt;if(p.age>p.life){p.active=false;continue;}const dx=Math.cos(this.time*.1+p.phase)*.003*(1+this.energy),dy=Math.sin(this.time*.13+p.phase)*.002;p.x+=dx*dt*motion;p.y+=dy*dt*motion;
 p.velocity+=(-p.spring*75-p.velocity*10)*dt;p.spring=Math.max(-.16,Math.min(.16,p.spring+p.velocity*dt));if(reduced)p.spring=p.velocity=0;
 const fade=clamp(p.age/2)*clamp((p.life-p.age)/3),retiring=p.life-p.age<3,stage=retiring?Math.min(6,Math.floor((3-(p.life-p.age))/3*7)):0;
 if(!reduced&&!retiring&&p.pawClock>1.2){const mark=this.paws.find(a=>!a.active);if(mark){p.side*=-1;Object.assign(mark,{active:true,x:p.x+p.side*.022*scale,y:p.y+.08*scale,age:0,life:7,angle:Math.atan2(dy,dx)+Math.PI/2,size:22*scale});}p.pawClock=0;}
 if(retiring&&p.dustClock>.06){const a=this.dust.find(a=>!a.active);if(a){const point=this.textures.point?.(p.variant,Math.floor(p.age*30))??[0,0];Object.assign(a,{active:true,x:p.x+point[0]*size/w,y:p.y+point[1]*size/h,age:0,life:2+this.random()*2,size:(.5+this.random())*scale,vx:(this.random()-.4)*.01,vy:-.005-this.random()*.005});}p.dustClock=0;}
 const texture=this.textures.get(p.variant,1,stage);if(texture){c.save();c.translate(p.x*w,p.y*h);c.rotate(Math.sin(this.time*.15+p.phase)*.07);c.scale(1-p.spring*.65,1+p.spring);c.globalAlpha=fade*.93;c.drawImage(texture,-size/2,-size/2,size,size);c.restore();}
 }
 for(const a of this.paws){if(!a.active)continue;a.age+=dt;if(a.age>a.life){a.active=false;continue;}if(this.paw){c.save();c.translate(a.x*w,a.y*h);c.rotate(a.angle);c.globalAlpha=Math.sin(Math.PI*a.age/a.life)*.26;c.drawImage(this.paw,-a.size/2,-a.size/2,a.size,a.size);c.restore();}}
 for(const a of this.dust){if(!a.active)continue;a.age+=dt;if(a.age>a.life){a.active=false;continue;}a.x+=a.vx*dt*motion;a.y+=a.vy*dt*motion;c.globalAlpha=Math.sin(Math.PI*a.age/a.life)*.45;c.fillStyle='#ead6c4';c.fillRect(a.x*w,a.y*h,a.size,a.size*.65);}c.globalAlpha=1;
 }
 dispose(){this.textures.dispose();if(this.paw)this.paw.width=this.paw.height=1;if(this.board)this.board.width=this.board.height=1;this.paw=this.board=undefined;for(const pool of [this.pals,this.paws,this.dust])for(const p of pool)p.active=false;}
}
