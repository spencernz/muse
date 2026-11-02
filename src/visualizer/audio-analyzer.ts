import { api, native } from "../native";
import { useMuse } from "../store";
import type { AnalysisStatus, AudioSignals, NativeAudioFrame } from "./types";
const clamp=(v:number)=>Number.isFinite(v)?Math.max(0,Math.min(1,v)):0;
/** Shared mutable DSP state. No React updates occur for individual audio frames. */
export class SignalProcessor {
 readonly pcm=new Uint8Array(1024).fill(128);
 readonly signals:AudioSignals={spectrum:new Float32Array(64),waveform:new Float32Array(128),bass:0,mids:0,treble:0,rms:0,transient:0,onset:0,live:false};
 private target=new Float32Array(68); private wave=new Float32Array(128);private previous=new Float32Array(64);
 private epoch=-1;private sequence=-1;private lastFresh=0;private mean=.015;private variance=.0002;private lastPeak=-10000;
 reset(){this.pcm.fill(128);this.target.fill(0);this.wave.fill(0);this.previous.fill(0);this.signals.spectrum.fill(0);this.signals.waveform.fill(0);this.signals.bass=0;this.signals.mids=0;this.signals.treble=0;this.signals.rms=0;this.signals.transient=0;this.signals.onset=0;this.signals.live=false;this.epoch=-1;this.sequence=-1;this.mean=.015;this.variance=.0002;this.lastPeak=-10000;this.lastFresh=0;}
 accept(frame:NativeAudioFrame,now:number):AnalysisStatus {
  if(frame.epoch!==this.epoch){this.reset();this.epoch=frame.epoch;}
  if(!frame.playing){this.silence();return "paused";}
  if(!frame.available){this.silence();return "starting";}
  if(frame.sequence!==this.sequence){this.lastFresh=now;this.sequence=frame.sequence;}else if(now-this.lastFresh>450){this.silence();return "stale";}
  let flux=0;
  for(let i=0;i<64;i++){const v=clamp(frame.bands[i]??0);flux+=Math.max(0,v-this.previous[i]);this.previous[i]=v;this.target[i]=v;}
  flux/=64;
  const threshold=this.mean+Math.max(.018,Math.sqrt(this.variance)*1.6);
  const rms=clamp(frame.rms);
  if(flux>threshold&&rms>.008&&now-this.lastPeak>280){this.signals.onset=clamp((flux-threshold)*7+.35);this.signals.transient=1;this.lastPeak=now;}
  const delta=flux-this.mean;this.mean+=delta*.06;this.variance=Math.max(.00002,this.variance*.94+delta*delta*.06);
  this.target[64]=clamp(rms*4);this.target[65]=clamp(frame.bass*4);this.target[66]=clamp(frame.mids*4);this.target[67]=clamp(frame.treble*5);
  for(let i=0;i<128;i++){const v=frame.waveform[i]??0;this.wave[i]=Number.isFinite(v)?Math.max(-1,Math.min(1,v)):0;}
  for(let i=0;i<1024;i++){const v=frame.pcm?.[i]??0;this.pcm[i]=Math.round(128+Math.max(-1,Math.min(1,Number.isFinite(v)?v:0))*127);}
  this.signals.live=true;return "live";
 }
 silence(){this.pcm.fill(128);this.target.fill(0);this.wave.fill(0);this.signals.live=false;}
 step(dt:number){
  const rise=1-Math.exp(-Math.min(.1,dt)/.055),fall=1-Math.exp(-Math.min(.1,dt)/.23);
  const smooth=(a:number,b:number)=>a+(b-a)*(b>a?rise:fall);
  for(let i=0;i<64;i++)this.signals.spectrum[i]=smooth(this.signals.spectrum[i],this.target[i]);
  for(let i=0;i<128;i++)this.signals.waveform[i]+=(this.wave[i]-this.signals.waveform[i])*rise;
  this.signals.rms=smooth(this.signals.rms,this.target[64]);this.signals.bass=smooth(this.signals.bass,this.target[65]);this.signals.mids=smooth(this.signals.mids,this.target[66]);this.signals.treble=smooth(this.signals.treble,this.target[67]);
  this.signals.transient*=Math.exp(-dt*8);this.signals.onset*=Math.exp(-dt*4);
 }
}
export class AudioAnalyzer {
 readonly processor=new SignalProcessor(); private clients=new Set<(status:AnalysisStatus)=>void>();private timer:ReturnType<typeof setTimeout>|undefined;private generation=0;private revision=0;private stopStore:(()=>void)|undefined;private status:AnalysisStatus="starting";
 private publish(status:AnalysisStatus){if(status!==this.status){this.status=status;for(const listener of this.clients)listener(status);}}
 subscribe(listener:(status:AnalysisStatus)=>void){this.clients.add(listener);listener(this.status);if(this.clients.size===1)this.start();return ()=>{this.clients.delete(listener);if(!this.clients.size)this.stop();};}
 private start(){
  const generation=++this.generation;this.processor.reset();this.publish("starting");
  if(!native){this.publish("unavailable");return;}
  let last=useMuse.getState().playback;let lastTime=performance.now();
  this.stopStore=useMuse.subscribe(state=>{const next=state.playback;const now=performance.now();if(next.current?.id!==last.current?.id||next.playing!==last.playing||Math.abs(next.position-last.position)>Math.max(1.2,(now-lastTime)/1000+.8)){this.revision++;this.processor.reset();this.publish(next.playing?"starting":"paused");}last=next;lastTime=now;});
  void api.visualizerActive(true).then(()=>{if(generation===this.generation)void this.poll(generation);}).catch(()=>{if(generation===this.generation)this.publish("unavailable");});
 }
 private async poll(generation:number){
  if(generation!==this.generation)return;
  const revision=this.revision;const track=useMuse.getState().playback.current?.id;
  try {const frame=await api.visualizerFrame();if(generation!==this.generation)return;if(revision===this.revision&&frame.trackId===useMuse.getState().playback.current?.id&&track===frame.trackId)this.publish(this.processor.accept(frame,performance.now()));}
  catch {if(generation===this.generation){this.processor.silence();this.publish("unavailable");}}
  if(generation===this.generation)this.timer=setTimeout(()=>void this.poll(generation),useMuse.getState().playback.playing?33:150);
 }
 private stop(){++this.generation;clearTimeout(this.timer);this.stopStore?.();this.stopStore=undefined;this.processor.reset();if(native)void api.visualizerActive(false).catch(()=>{});}
}
export const audioAnalyzer=new AudioAnalyzer();
