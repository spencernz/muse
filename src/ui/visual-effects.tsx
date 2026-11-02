import { ChevronDown, Expand, Maximize2, Minimize2, X } from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import { native } from '../native';
import { VisualFullscreenSession } from '../visualizer/fullscreen';
import { useEffect, useMemo, useRef, useState } from 'react';
import { audioAnalyzer } from '../visualizer/audio-analyzer';
import { VisualizerEngine } from '../visualizer/engine';
import { loadPreferences, savePreferences, shuffledEffect } from '../visualizer/preferences';
import { paletteFor } from '../visualizer/palettes';
import { effects, themes, type AnalysisStatus, type VisualPreferences } from '../visualizer/types';
import { useAlbumAtmosphere } from '../use-album-atmosphere';
const effectNames={spectrum:'Spectrum',wave:'Wave',retro:'Retro',fire:'Fire',chalk:'Chalk Zoo'};
const themeNames={album:'Album adaptive',aurora:'Aurora',ember:'Ember',ice:'Ice',mono:'Monochrome'};
const statusNames:Record<AnalysisStatus,string>={starting:'Waiting for audio…',live:'Live audio',paused:'Paused',stale:'Audio signal interrupted · playback is unaffected',unavailable:'Ambient preview · audio analysis is unavailable'};
export function VisualEffectsTab({source,expanded=false,onExpandedChange}:{source?:string;expanded?:boolean;onExpandedChange?:(value:boolean)=>void}){
 const [fullscreen,setFullscreen]=useState(false),[transitioning,setTransitioning]=useState(false),[displayError,setDisplayError]=useState<string|null>(null);
 const restoreFocus=useRef(false);
 const session=useRef<VisualFullscreenSession|null>(null),fullscreenButton=useRef<HTMLButtonElement>(null),mounted=useRef(true);
 async function closeFullscreen(){
  setTransitioning(true);
  try{await session.current?.close();session.current=null;if(!mounted.current)return;host.current?.close();host.current?.show();restoreFocus.current=true;setFullscreen(false);}
  catch{if(mounted.current)setDisplayError('Could not exit fullscreen. Try Close again.');}
  finally{if(mounted.current)setTransitioning(false);}
 }
 async function openFullscreen(){
  if(session.current)return;setDisplayError(null);setTransitioning(true);
  const current=new VisualFullscreenSession();session.current=current;
  try{host.current?.close();host.current?.showModal();setFullscreen(true);await current.ready;}
  catch{if(mounted.current){setDisplayError('Could not open fullscreen. Try again.');await closeFullscreen();}}
  finally{if(mounted.current)setTransitioning(false);}
 }
 useEffect(()=>{if(!fullscreen&&restoreFocus.current){restoreFocus.current=false;fullscreenButton.current?.focus();}},[fullscreen]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;void session.current?.close().catch(()=>{});};},[]);
 useEffect(()=>{if(!fullscreen||!native)return;let disposed=false;let unlisten:(()=>void)|undefined;void listen<boolean>('native-fullscreen-changed',event=>{if(!event.payload&&!transitioning)void closeFullscreen();}).then(stop=>{if(disposed)stop();else unlisten=stop;}).catch(()=>{});return()=>{disposed=true;unlisten?.();};},[fullscreen,transitioning]);

 const [diagnostic,setDiagnostic]=useState<string|null>(null);
 const [preferences,setPreferences]=useState(loadPreferences);const [status,setStatus]=useState<AnalysisStatus>('starting');const [fallback,setFallback]=useState(false);const [visible,setVisible]=useState(!document.hidden);const [reduced,setReduced]=useState(()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false);
 const host=useRef<HTMLDialogElement>(null),canvas=useRef<HTMLCanvasElement>(null),atmosphere=useRef<HTMLCanvasElement>(null),engine=useRef<VisualizerEngine|null>(null);
 const album=useAlbumAtmosphere(source);const palette=useMemo(()=>paletteFor(preferences.theme,album.accent),[preferences.theme,album.accent]);
 function update(change:Partial<VisualPreferences>){setPreferences(previous=>{const next={...previous,...change};savePreferences(next);return next;});}
 useEffect(()=>{const media=window.matchMedia?.('(prefers-reduced-motion: reduce)');const change=()=>setReduced(media?.matches??false);media?.addEventListener('change',change);return()=>media?.removeEventListener('change',change);},[]);
 useEffect(()=>{let intersecting=true;const change=()=>setVisible(intersecting&&!document.hidden);document.addEventListener('visibilitychange',change);const observer=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>{intersecting=entries[0]?.isIntersecting??false;change();});if(host.current)observer?.observe(host.current);return()=>{document.removeEventListener('visibilitychange',change);observer?.disconnect();};},[]);
 // One subscription and one engine for the visible panel, independent of effect changes.
 const latest=useRef({preferences,palette,reduced});useEffect(()=>{latest.current={preferences,palette,reduced};engine.current?.update(preferences,palette,reduced);},[preferences,palette,reduced]);
 useEffect(()=>{
  if(!visible||!canvas.current||!atmosphere.current)return;
  const stop=audioAnalyzer.subscribe(setStatus);
  try{const value=latest.current;engine.current=new VisualizerEngine(canvas.current,atmosphere.current,value.preferences,value.palette,value.reduced,()=>setFallback(true),setDiagnostic);}catch{setFallback(true);}
  return()=>{stop();engine.current?.dispose();engine.current=null;};
 },[visible]);
 useEffect(()=>{if(!preferences.auto||!visible||reduced)return;const timer=setInterval(()=>setPreferences(previous=>{const next={...previous,effect:shuffledEffect(previous.effect)};savePreferences(next);return next;}),30000);return()=>clearInterval(timer);},[preferences.auto,visible,reduced]);
 return <dialog open className={`visual-effects ${fullscreen?'visual-effects--fullscreen':''}`} ref={host} role={fullscreen?'dialog':'region'} aria-modal={fullscreen?true:undefined} aria-label={fullscreen?'Fullscreen visual effects':'Visual effects'} onCancel={event=>{event.preventDefault();void closeFullscreen();}}>
  <div className="visual-display-actions">
   {fullscreen?<button className="iconbtn" aria-label="Close fullscreen visual" title="Close fullscreen visual" onClick={()=>void closeFullscreen()}><X size={24}/></button>:<>
    {onExpandedChange&&<button className="iconbtn" aria-label={expanded?'Restore visual width':'Expand visual width'} title={expanded?'Restore width':'Expand'} aria-pressed={expanded} onClick={()=>onExpandedChange(!expanded)}>{expanded?<Minimize2 size={19}/>:<Expand size={19}/>}</button>}
    <button ref={fullscreenButton} className="iconbtn" aria-label="Fullscreen visual" title="Fullscreen" disabled={transitioning} onClick={()=>void openFullscreen()}><Maximize2 size={19}/></button>
   </>}
  </div>
  {displayError&&<p className="visual-display-error" role="alert">{displayError}</p>}
  <div className="visual-stage" role="img" aria-label={`${effectNames[preferences.effect]} music visualization`}>
   <canvas ref={atmosphere} aria-hidden="true"/><canvas ref={canvas} aria-hidden="true"/>
   <span className="visual-status" role="status">{diagnostic??statusNames[status]}{fallback?' · Canvas mode':''}{reduced?' · Reduced motion':''}</span>
  </div>
  <div className="visual-controls">
   <div className="visual-modes" role="group" aria-label="Visual effect">{effects.map(effect=><button key={effect} aria-pressed={preferences.effect===effect} onClick={()=>update({effect})}>{effectNames[effect]}</button>)}</div>
   <div className="visual-options">{!["chalk","retro"].includes(preferences.effect)&&<><label>Energy <input aria-label="Visual energy" type="range" min="0.25" max="2" step="0.05" value={preferences.intensity} onChange={event=>update({intensity:Number(event.target.value)})}/></label><label>Colour <span className="visual-select"><select value={preferences.theme} onChange={event=>update({theme:event.target.value as VisualPreferences['theme']})}>{themes.map(theme=><option key={theme} value={theme}>{themeNames[theme]}</option>)}</select><ChevronDown size={14} aria-hidden="true"/></span></label></>}<label className="visual-auto"><input type="checkbox" checked={preferences.auto} onChange={event=>update({auto:event.target.checked})}/>Shuffle effects</label></div>
  </div>
 </dialog>;
}
