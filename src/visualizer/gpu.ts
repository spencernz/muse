import { fragmentShader, vertexShader } from "./shaders";
import { rgb } from "./palettes";
import type { AudioSignals, EffectMode, Palette } from "./types";
export class AtmosphericRenderer {
 private fireFlow=0;private lastTime:number|undefined;
 private gl:WebGLRenderingContext;private program:WebGLProgram;private buffer:WebGLBuffer;private uniforms:Record<string,WebGLUniformLocation|null>={};
 constructor(canvas:HTMLCanvasElement){
  const gl=canvas.getContext("webgl",{alpha:false,antialias:false,powerPreference:"low-power",preserveDrawingBuffer:false});if(!gl)throw new Error("WebGL unavailable");this.gl=gl;
  const shaders:WebGLShader[]=[];
  const compile=(type:number,source:string)=>{const shader=gl.createShader(type);if(!shader)throw new Error("Shader allocation failed");shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error("Visualizer shader unsupported");return shader;};
  const program=gl.createProgram();const buffer=gl.createBuffer();if(!program||!buffer){if(program)gl.deleteProgram(program);if(buffer)gl.deleteBuffer(buffer);throw new Error("Graphics resources unavailable");}this.program=program;this.buffer=buffer;
  try{gl.attachShader(program,compile(gl.VERTEX_SHADER,vertexShader));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragmentShader));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error("Visualizer linking failed");}
  catch(error){gl.deleteProgram(program);gl.deleteBuffer(buffer);throw error;}finally{for(const shader of shaders)gl.deleteShader(shader);}
  gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  const position=gl.getAttribLocation(program,"a_position");gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
  for(const name of ["size","time","flow","bass","mids","treble","rms","intensity","mode","motion","a","b","c"])this.uniforms[name]=gl.getUniformLocation(program,`u_${name}`);
 }
 draw(mode:EffectMode,time:number,signals:AudioSignals,palette:Palette,intensity:number,reduced:boolean){
  const dt=this.lastTime===undefined?0:Math.min(.1,Math.max(0,time-this.lastTime));this.lastTime=time;
  if(mode==="fire"&&signals.live&&!reduced)this.fireFlow+=dt*(.6+Math.min(1.4,signals.mids*intensity)*.4);
  const gl=this.gl;if(gl.isContextLost())throw new Error("Graphics context lost");
  gl.viewport(0,0,gl.canvas.width,gl.canvas.height);gl.useProgram(this.program);gl.uniform2f(this.uniforms.size,gl.canvas.width,gl.canvas.height);
  for(const [name,value] of [["time",time],["flow",this.fireFlow],["bass",signals.bass],["mids",signals.mids],["treble",signals.treble],["rms",signals.rms],["intensity",intensity],["mode",1],["motion",reduced?0:1]] as const)gl.uniform1f(this.uniforms[name],value);
  for(const [index,name] of ["a","b","c"].entries()){const colour=rgb(palette[index]);gl.uniform3f(this.uniforms[name],...colour);}
  gl.drawArrays(gl.TRIANGLES,0,6);
 }
 dispose(){this.gl.deleteBuffer(this.buffer);this.gl.deleteProgram(this.program);}
}
