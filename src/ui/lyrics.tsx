import { useEffect, useMemo, useRef, useState } from "react";
import { api, type Lyrics } from "../native";
import { parseLrc } from "../lyrics";
import { useMuse } from "../store";
export function LyricsPanel({ trackId }: { trackId: string }) {
  const [result,setResult]=useState<Lyrics|null>(null), [loading,setLoading]=useState(true), [error,setError]=useState<string|null>(null), [revision,setRevision]=useState(0);
  const activeLine=useRef<HTMLButtonElement|null>(null);
  const scrollArea=useRef<HTMLDivElement|null>(null);
  const position=useMuse(s=>s.playback.position);
  useEffect(()=> {
    let active=true;
    setLoading(true); setError(null); setResult(null);
    void api.lyrics(trackId).then(value=>{if(active)setResult(value);}).catch(e=>{if(active)setError(typeof e==="string"?e:"Could not load lyrics.");}).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[trackId,revision]);
  const lines=useMemo(()=>parseLrc(result?.synced??""),[result]);
  let index=-1;
  for(let i=0;i<lines.length;i++) {if(lines[i].time<=position)index=i;else break;}
  useEffect(()=> {
    const area=scrollArea.current, line=activeLine.current;
    if(!area || !line)return;
    const top=area.scrollTop+line.getBoundingClientRect().top-area.getBoundingClientRect().top-area.clientHeight/2+line.offsetHeight/2;
    area.scrollTo({top,behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});
  },[index]);
  return <section className="lyrics-panel" aria-label="Lyrics">
    {loading?<p role="status">Finding lyrics…</p>:error?<div role="alert"><p>{error}</p><button className="secondary" onClick={()=>setRevision(value=>value+1)}>Retry lyrics</button></div>:result?.instrumental?<p>This track is instrumental.</p>:lines.length?<div className="lyrics-scroll" ref={scrollArea} tabIndex={0} aria-label="Synced lyrics">{lines.map((line,i)=><button key={i} ref={i===index?activeLine:undefined} className={`lyric-line ${i===index?"current":""}`} aria-current={i===index?"true":undefined} aria-label={`Seek to ${Math.floor(line.time/60)}:${String(Math.floor(line.time%60)).padStart(2,"0")}: ${line.text||"Instrumental break"}`} onClick={()=>void useMuse.getState().control({action:"seek",value:line.time})}>{line.text||"♪"}</button>)}</div>:result?.plain?<div className="lyrics-scroll lyrics-plain" tabIndex={0}>{result.plain}</div>:<p>Lyrics aren’t available for this track.</p>}

  </section>;
}
