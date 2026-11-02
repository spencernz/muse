import { useEffect, useState, type CSSProperties } from "react";
import { ExternalLink, Heart, Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { api, artwork } from "../native";
import { useMuse } from "../store";
import { useAlbumAtmosphere } from "../use-album-atmosphere";
import { Cover } from "./shared";
export function BackgroundPlayer() {
  const playback=useMuse(s=>s.playback),revision=useMuse(s=>s.revision),error=useMuse(s=>s.error);
  const track=playback.current;
  const [favourite,setFavourite]=useState<{id:string;liked:boolean}|null>(null),[saving,setSaving]=useState(false);
  const fallbackCover=useMuse(s=>s.library.albums.find(album=>album.id===track?.albumId)?.cover);
  const cover=track?.cover??fallbackCover;
  const trackId=track?.id;
  const theme=useAlbumAtmosphere(artwork(cover));
  const style={"--muse-accent":theme.accent,"--muse-on-accent":theme.onAccent,"--mini-background":theme.background,"--mini-muted":theme.muted} as CSSProperties;
  const liked=favourite?.id===track?.id?favourite?.liked:track?.liked??false;
  useEffect(()=>{
    let active=true;
    if(trackId)void api.getTracks([trackId]).then(rows=>{if(active)setFavourite({id:trackId,liked:rows[0]?.liked??false});}).catch(useMuse.getState().fail);
    return ()=>{active=false;};
  },[trackId,revision]);
  useEffect(()=>{
    const dismiss=(event:KeyboardEvent)=>{if(event.key==="Escape")void api.hideMiniPlayer();};
    window.addEventListener("keydown",dismiss);return ()=>window.removeEventListener("keydown",dismiss);
  },[]);
  async function toggleFavourite() {
    if(!track || saving)return;
    setSaving(true);
    try {await api.favourite(track.id,!liked);setFavourite({id:track.id,liked:!liked});}
    catch(e){useMuse.getState().fail(e);}finally{setSaving(false);}
  }
  return <main className="background-player" style={style} aria-label="Muse mini player">
    {cover && <img key={cover} className="background-player-art" src={artwork(cover)} alt="" aria-hidden="true" onError={event=>{event.currentTarget.style.visibility="hidden";}} />}
    <header className="background-player-header"><span data-tauri-drag-region>muse.</span><button className="background-icon" aria-label="Open Muse" title="Open Muse" onClick={()=>void api.showMainWindow()}><ExternalLink size={16}/></button><button className="background-icon" aria-label="Hide mini player" title="Hide mini player" onClick={()=>void api.hideMiniPlayer()}><X size={18}/></button></header>
    <div className="background-track"><div className="background-cover"><Cover key={cover??track?.id} path={cover} title={track?.album??"muse"}/></div><div className="background-track-text"><strong title={track?.title}>{track?.title??"Nothing playing"}</strong><span title={track?.artist}>{track?.artist??"Open Muse to choose your music"}</span>{error && <small role="alert">{error}</small>}</div></div>
    <div className="background-controls" role="group" aria-label="Playback controls"><button className="background-icon" aria-label="Previous track" disabled={!track} onClick={()=>void useMuse.getState().control({action:"previous"})}><SkipBack size={22}/></button><button className="background-toggle" aria-label={playback.playing?"Pause":"Play"} disabled={!track} onClick={()=>void useMuse.getState().control({action:"toggle"})}>{playback.playing?<Pause size={24} fill="currentColor"/>:<Play size={24} fill="currentColor"/>}</button><button className="background-icon" aria-label="Next track" disabled={!track} onClick={()=>void useMuse.getState().control({action:"next"})}><SkipForward size={22}/></button><button className="background-icon background-favourite" aria-label={liked?"Remove from favourites":"Add to favourites"} aria-pressed={liked} disabled={!track||saving} onClick={()=>void toggleFavourite()}><Heart size={21} fill={liked?"currentColor":"none"}/></button></div>
  </main>;
}
