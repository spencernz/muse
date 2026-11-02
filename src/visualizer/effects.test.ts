import {expect,it,vi} from 'vitest';
import {CanvasEffects} from './effects';
import {effects,type DrawFrame} from './types';
it('renders Canvas effects with finite geometry',()=>{
 const strokes=vi.fn(),gradient={addColorStop:vi.fn()};const geometry=(...values:number[])=>{expect(values.every(Number.isFinite)).toBe(true);};
 const context={clearRect:vi.fn(),fillRect:vi.fn(),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,beginPath:vi.fn(),arc:geometry,fill:vi.fn(),moveTo:geometry,lineTo:geometry,bezierCurveTo:geometry,stroke:strokes,closePath:vi.fn(),save:vi.fn(),restore:vi.fn(),translate:geometry,rotate:geometry,scale:geometry,drawImage:vi.fn(),ellipse:geometry} as unknown as CanvasRenderingContext2D;
 const f:DrawFrame={ctx:context,width:640,height:360,time:10,dt:.016,signals:{spectrum:new Float32Array(64).fill(.5),waveform:new Float32Array(128).fill(.2),rms:.5,bass:.6,mids:.3,treble:.2,onset:1,transient:1,live:true},palette:['#35e6cf','#986aff','#ffffff'],intensity:1,reduced:false,quality:1};
 const renderer=new CanvasEffects();for(const effect of effects.filter(effect=>effect!=='chalk'&&effect!=='retro'))renderer.draw(effect,f,false);renderer.dispose();
});
