import {expect,it,vi} from 'vitest';
import {CanvasEffects} from './effects';
import type {DrawFrame} from './types';
it('keeps consecutive ember positions continuous when audio changes after three minutes',()=>{
 const arc=vi.fn();const context={clearRect:vi.fn(),beginPath:vi.fn(),arc,fill:vi.fn()} as unknown as CanvasRenderingContext2D;
 const frame:DrawFrame={ctx:context,width:640,height:360,time:180,dt:1/60,signals:{spectrum:new Float32Array(64),waveform:new Float32Array(128),rms:.2,bass:.3,mids:.2,treble:.1,onset:0,transient:0,live:true},palette:['#ff632f','#bf264e','#ffe39b'],intensity:1,reduced:false,quality:1};
 const renderer=new CanvasEffects();renderer.draw('fire',frame,true);const before=arc.mock.calls.map(call=>Number(call[1])/360);arc.mockClear();
 renderer.draw('fire',{...frame,time:180+1/60,signals:{...frame.signals,mids:.22}},true);
 const after=arc.mock.calls.map(call=>Number(call[1])/360);
 const travel=after.map((y,i)=>{const difference=Math.abs(y-before[i]);return Math.min(difference,1-difference);});
 expect(Math.max(...travel)).toBeLessThan(.01);
});
it('holds ember positions still for pause and reduced motion',()=>{
 const arc=vi.fn();const context={clearRect:vi.fn(),beginPath:vi.fn(),arc,fill:vi.fn()} as unknown as CanvasRenderingContext2D;
 const frame:DrawFrame={ctx:context,width:640,height:360,time:180,dt:1/60,signals:{spectrum:new Float32Array(64),waveform:new Float32Array(128),rms:.2,bass:.3,mids:.2,treble:.1,onset:0,transient:0,live:false},palette:['#ff632f','#bf264e','#ffe39b'],intensity:1,reduced:false,quality:1};
 const renderer=new CanvasEffects();renderer.draw('fire',frame,true);const before=arc.mock.calls.map(call=>call[1]);arc.mockClear();renderer.draw('fire',{...frame,time:180,signals:{...frame.signals,mids:.8}},true);expect(arc.mock.calls.map(call=>call[1])).toEqual(before);
 arc.mockClear();renderer.draw('fire',{...frame,reduced:true,signals:{...frame.signals,live:true,mids:1}},true);expect(arc.mock.calls.map(call=>call[1])).toEqual(before);
});

import {AtmosphericRenderer} from './gpu';
it('sends a continuous integrated flame phase to the shader across energy changes and pause',()=>{
 const values=new Map<string,number>();const gl={
  VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,ARRAY_BUFFER:5,STATIC_DRAW:6,FLOAT:7,TRIANGLES:8,canvas:{width:640,height:360},
  createShader:()=>({}),shaderSource:vi.fn(),compileShader:vi.fn(),getShaderParameter:()=>true,createProgram:()=>({}),createBuffer:()=>({}),attachShader:vi.fn(),linkProgram:vi.fn(),getProgramParameter:()=>true,deleteShader:vi.fn(),useProgram:vi.fn(),bindBuffer:vi.fn(),bufferData:vi.fn(),getAttribLocation:()=>0,enableVertexAttribArray:vi.fn(),vertexAttribPointer:vi.fn(),getUniformLocation:(_:unknown,name:string)=>name,isContextLost:()=>false,viewport:vi.fn(),uniform2f:vi.fn(),uniform3f:vi.fn(),uniform1f:(name:string,value:number)=>values.set(name,value),drawArrays:vi.fn(),deleteBuffer:vi.fn(),deleteProgram:vi.fn(),
 };
 const renderer=new AtmosphericRenderer({getContext:()=>gl} as unknown as HTMLCanvasElement);
 const signals={spectrum:new Float32Array(64),waveform:new Float32Array(128),rms:.2,bass:.3,mids:.2,treble:.1,onset:0,transient:0,live:true};const palette=['#ff632f','#bf264e','#ffe39b'] as const;
 renderer.draw('fire',180,signals,palette,1,false);const initial=values.get('u_flow')!;expect(initial).toBe(0);
 renderer.draw('fire',180+1/60,{...signals,mids:.22},palette,1,false);const next=values.get('u_flow')!;expect(next-initial).toBeGreaterThan(0);expect(next-initial).toBeLessThan(.02);
 renderer.draw('fire',181,{...signals,live:false,mids:1},palette,1,false);expect(values.get('u_flow')).toBe(next);
 renderer.draw('fire',182,signals,palette,1,true);expect(values.get('u_flow')).toBe(next);
 renderer.dispose();expect(gl.deleteProgram).toHaveBeenCalledTimes(1);expect(gl.deleteBuffer).toHaveBeenCalledTimes(1);
});
