import {afterEach,expect,it,vi} from 'vitest';
import {ChalkEffect} from './chalk';
import type {DrawFrame} from './types';
afterEach(()=>vi.restoreAllMocks());
it('animates bounded beat springs, textured trails and dust through multiple lifetimes',()=>{
 const noop=()=>{},gradient={addColorStop:noop};const context={fillRect:noop,clearRect:noop,beginPath:noop,ellipse:noop,fill:noop,createPattern:()=>null,createRadialGradient:()=>gradient,save:noop,restore:noop,translate:noop,rotate:noop,scale:noop,drawImage:vi.fn()} as unknown as CanvasRenderingContext2D;
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(context);
 const dispose=vi.fn(),effect=new ChalkEffect({get:()=>({}) as CanvasImageSource,point:()=>[.2,.1],dispose});
 const f:DrawFrame={ctx:context,width:3840,height:2160,time:0,dt:.05,signals:{live:true,rms:.6,bass:.8,mids:.4,treble:.2,onset:1,transient:1,spectrum:new Float32Array(64),waveform:new Float32Array(128)},palette:['#fff','#eee','#aaa'],quality:1,intensity:1,reduced:false};
 let sawDust=false,sawPaws=false,sawSpring=false;const seen=new Set<number>();for(let i=0;i<1600;i++){effect.draw(f);const snapshot=effect.snapshot();expect(snapshot.pals).toBeLessThanOrEqual(12);expect(snapshot.paws).toBeLessThanOrEqual(100);expect(snapshot.dust).toBeLessThanOrEqual(200);expect(snapshot.springs.every(v=>Number.isFinite(v)&&Math.abs(v)<=.16)).toBe(true);sawDust ||=snapshot.dust>0;sawPaws ||=snapshot.paws>0;sawSpring ||=snapshot.springs.some(v=>Math.abs(v)>.01);snapshot.variants.forEach(v=>seen.add(v));}
 expect(sawDust&&sawPaws&&sawSpring).toBe(true);expect(seen.size).toBe(12);effect.draw({...f,reduced:true});expect(effect.snapshot().springs.every(v=>v===0)).toBe(true);effect.dispose();expect(dispose).toHaveBeenCalledOnce();expect(effect.snapshot()).toMatchObject({pals:0,paws:0,dust:0});
});
