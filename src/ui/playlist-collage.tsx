import { useCallback, useEffect, useRef, useState } from "react";
import { Heart, ListMusic } from "lucide-react";
import { api, artwork } from "../native";
import { chooseCovers, rotateCover } from "../playlist-collage";
import { useMuse } from "../store";

function CollageImage({path, onBroken}: {path:string; onBroken:(path:string)=>void}) {
  const [image,setImage]=useState({current:path,previous:""});
  useEffect(()=>{
    if(path===image.current)return;
    let active=true;
    const preload=new Image();
    preload.onload=()=>{if(active)setImage(current=>({current:path,previous:current.current}));};
    preload.onerror=()=>{if(active)onBroken(path);};
    preload.src=artwork(path)??"";
    return ()=>{active=false;preload.onload=null;preload.onerror=null;preload.removeAttribute("src");};
  },[path,image,onBroken]);
  return <>{image.previous && <img src={artwork(image.previous)} alt="" />}
    <img key={image.current} className="collage-image-in" src={artwork(image.current)} alt="" loading="lazy" decoding="async" onError={()=>onBroken(image.current)} /></>;
}
export function PlaylistCollageCard({id,name,detail,onOpen}: {id:string|null; name:string; detail:string; onOpen:()=>void}) {
  const revision=useMuse(s=>s.revision);
  const [{pool,shown},setImages]=useState<{pool:string[];shown:string[]}>({pool:[],shown:[]});
  const [paused,setPaused]=useState(false),[visible,setVisible]=useState(true),[motion,setMotion]=useState(false);
  const [variant]=useState(()=>Math.floor(Math.random()*3));
  const card=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    let active=true;
    void api.playlistCovers(id).then(paths=>{if(active){const unique=[...new Set(paths.filter(Boolean))].slice(0,50);setImages({pool:unique,shown:chooseCovers(unique)});}}).catch(()=>{if(active){setImages({pool:[],shown:[]});}});
    return ()=>{active=false;};
  },[id,revision]);
  useEffect(()=>{
    const preference=window.matchMedia("(prefers-reduced-motion: reduce)");
    const update=()=>setMotion(preference.matches || document.hidden);
    update(); preference.addEventListener("change",update); document.addEventListener("visibilitychange",update);
    const observer=typeof IntersectionObserver!=="undefined"?new IntersectionObserver(entries=>setVisible(entries[0]?.isIntersecting??false)):null;
    if(card.current)observer?.observe(card.current);
    return ()=>{preference.removeEventListener("change",update);document.removeEventListener("visibilitychange",update);observer?.disconnect();};
  },[]);
  useEffect(()=>{
    if(paused || !visible || motion || pool.length<=shown.length)return;
    const timer=window.setInterval(()=>setImages(current=>({...current,shown:rotateCover(current.shown,current.pool)})),4200+Math.random()*2800);
    return ()=>window.clearInterval(timer);
  },[paused,visible,motion,pool,shown.length]);
  const broken=useCallback((path:string)=>{
    setImages(current=>{const next=current.pool.filter(item=>item!==path);return {pool:next,shown:chooseCovers(next)};});
  },[]);
  const Icon=id===null?Heart:ListMusic;
  return <button ref={card} className="playlist-card playlist-collage-card" onClick={onOpen} aria-label={`${name}, ${detail}`} onMouseEnter={()=>setPaused(true)} onMouseLeave={()=>setPaused(false)} onFocus={()=>setPaused(true)} onBlur={()=>setPaused(false)}>
    {shown.length>0?<div className={`playlist-mosaic mosaic-${shown.length} mosaic-variant-${variant}`} aria-hidden="true">{shown.map((path,index)=><div className="playlist-mosaic-cell" key={index}><CollageImage path={path} onBroken={broken}/></div>)}</div>:<Icon className="playlist-collage-fallback" size={32} aria-hidden="true"/>}
    <div className="playlist-collage-caption"><h2>{name}</h2><p>{detail}</p></div>
  </button>;
}
