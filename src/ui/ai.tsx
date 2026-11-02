import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { ai, aiMessage, type AiSettings, type AlbumInfoPreview } from "../ai";
import { useMuse } from "../store";
import { Cover, Dialog } from "./shared";

export function AiSettingsSection() {
  const context=useMuse(s=>s.context);
  const [expanded,setExpanded]=useState(context==="ai");
  const [state,setState]=useState<AiSettings|null>(null);
  const [model,setModel]=useState("gpt-4o-mini"),[key,setKey]=useState("");
  const [busy,setBusy]=useState<string|null>(null),[error,setError]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null);
  const alive=useRef(false),working=useRef(false);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{
    if(!expanded)return;
    let active=true;setBusy("Loading AI settings…");
    void ai.settings().then(value=>{if(active){setState(value);setModel(value.model);setError(null);}}).catch(e=>{if(active)setError(aiMessage(e));}).finally(()=>{if(active)setBusy(null);});
    return()=>{active=false;};
  },[expanded]);
  async function run(label:string,action:()=>Promise<void>) {
    if(working.current)return;working.current=true;setBusy(label);setError(null);setNotice(null);
    try{await action();}catch(e){if(alive.current)setError(aiMessage(e));}finally{working.current=false;if(alive.current)setBusy(null);}
  }
  return <section className="background-settings" aria-labelledby="ai-settings-heading">
    <h2 className="section-title" id="ai-settings-heading">AI</h2>
    <p className="sub">Use OpenAI to identify albums and find metadata and covers. Only album, artist and track titles are sent; audio and server connection details stay private.</p>
    {!expanded ? <button className="secondary" onClick={()=>setExpanded(true)}><Sparkles size={16}/>Configure OpenAI</button> : <form className="provider-form" onSubmit={event=>{event.preventDefault();void run("Saving AI settings…",async()=>{const value=await ai.save(model.trim(),key.trim()||null);if(alive.current){setState(value);setModel(value.model);setKey("");setNotice("OpenAI settings saved. The API key stays in the system credential store.");}});}}>
      {busy && <p role="status">{busy}</p>}
      <p className="sub">{state?.configured ? "API key saved in your system credential store." : "Add an OpenAI API key to enable album lookup."} Searches use your OpenAI API account.</p>
      <label htmlFor="openai-key">OpenAI API key{state?.configured ? " (leave blank to keep saved key)" : ""}</label>
      <input id="openai-key" type="password" value={key} onChange={e=>setKey(e.target.value)} maxLength={512} autoComplete="off" spellCheck={false} disabled={!!busy} placeholder={state?.configured ? "Saved securely" : "Enter your API key"}/>
      <label htmlFor="openai-model">OpenAI model</label>
      <input id="openai-model" value={model} onChange={e=>setModel(e.target.value)} maxLength={100} autoComplete="off" spellCheck={false} required disabled={!!busy}/>
      {error && <p role="alert" className="notice notice-error">{error}</p>}{notice && <p role="status">{notice}</p>}
      <div className="actions">
        <button className="primary" disabled={!!busy || (!key.trim()&&!state?.configured)}>Save AI settings</button>
        <button type="button" className="secondary" disabled={!!busy || !state?.configured || !!key || model!==state.model} onClick={()=>void run("Testing saved OpenAI connection…",async()=>{await ai.test();if(alive.current)setNotice("OpenAI connection is ready.");})}>Test saved connection</button>
        {state?.configured && <button type="button" className="secondary" disabled={!!busy} onClick={()=>void run("Removing API key…",async()=>{const value=await ai.removeKey();if(alive.current){setState(value);setKey("");setNotice("Saved OpenAI API key removed.");}})}>Remove API key</button>}
      </div>
    </form>}
  </section>;
}
export function AlbumInfoDialog({albumId,onClose}:{albumId:string;onClose:()=>void}) {
  const [preview,setPreview]=useState<AlbumInfoPreview|null>(null);
  const [title,setTitle]=useState(""),[artist,setArtist]=useState(""),[year,setYear]=useState(""),[genre,setGenre]=useState("");
  const [applyCover,setApplyCover]=useState(true),[missingKey,setMissingKey]=useState(false);
  const [busy,setBusy]=useState(true),[error,setError]=useState<string|null>(null);
  const alive=useRef(false),started=useRef(false),working=useRef(false),pending=useRef<string|null>(null);
  async function search() {
    if(working.current)return;working.current=true;setBusy(true);setError(null);
    try {
      const settings=await ai.settings();
      if(!alive.current)return;
      setMissingKey(!settings.configured);if(!settings.configured)return;
      if(pending.current){await ai.discard(pending.current);pending.current=null;}
      const value=await ai.searchAlbum(albumId);
      if(!alive.current){void ai.discard(value.id).catch(()=>{});return;}
      pending.current=value.id;setPreview(value);setTitle(value.title);setArtist(value.artist);setYear(value.year?.toString()??"");setGenre(value.genre);setApplyCover(value.newCover);
    }catch(e){if(alive.current)setError(aiMessage(e));}finally{working.current=false;if(alive.current)setBusy(false);}
  }
  useEffect(()=>{
    alive.current=true;if(!started.current){started.current=true;void search();}
    return()=>{alive.current=false;if(pending.current)void ai.discard(pending.current).catch(()=>{});};
    // A mounted dialog represents one explicit album lookup, including in StrictMode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  async function apply() {
    if(!preview||working.current)return;working.current=true;setBusy(true);setError(null);
    try{await ai.applyAlbum(preview.id,{title:title.trim(),artist:artist.trim(),year:year?Number(year):null,genre:genre.trim(),applyCover});pending.current=null;await useMuse.getState().refresh();if(alive.current)onClose();}
    catch(e){if(alive.current)setError(aiMessage(e));}finally{working.current=false;if(alive.current)setBusy(false);}
  }
  return <Dialog title="Album info" onClose={onClose}>
    <div className="album-info-editor">
      {busy && <p role="status">{preview ? "Saving album info…" : "Identifying album and finding a cover…"}</p>}
      {missingKey && <><p>Add your OpenAI API key in Settings to use album lookup.</p><button className="primary" onClick={()=>{onClose();useMuse.getState().navigate("settings","ai");}}>Open AI settings</button></>}
      {error && <p role="alert" className="notice notice-error">{error}</p>}
      {preview && <>
        <div className="album-info-summary"><div className="cover"><Cover path={preview.cover} title={title} artist={artist}/></div><div><p>Review the album details and cover before applying.</p><p className="sub">{preview.source}</p>{preview.warning && <p className="sub">{preview.warning}</p>}</div></div>
        <label htmlFor="album-info-title">Album title</label><input id="album-info-title" value={title} onChange={e=>setTitle(e.target.value)} maxLength={512} disabled={busy} required/>
        <label htmlFor="album-info-artist">Album artist</label><input id="album-info-artist" value={artist} onChange={e=>setArtist(e.target.value)} maxLength={512} disabled={busy} required/>
        <label htmlFor="album-info-year">Release year</label><input id="album-info-year" type="number" min={1800} max={2200} value={year} onChange={e=>setYear(e.target.value)} disabled={busy}/>
        <label htmlFor="album-info-genre">Genre</label><input id="album-info-genre" value={genre} onChange={e=>setGenre(e.target.value)} maxLength={512} disabled={busy}/>
        {preview.newCover && <label className="album-info-cover-choice"><input type="checkbox" checked={applyCover} onChange={e=>setApplyCover(e.target.checked)} disabled={busy}/>Update album cover</label>}
        <p className="sub">Saved in Muse and kept through future syncs. Music files stay unchanged.</p>
      </>}
      <div className="actions">
        {preview && <button className="primary" disabled={busy||!title.trim()||!artist.trim()||(!!year&&(!Number.isInteger(Number(year))||Number(year)<1800||Number(year)>2200))} onClick={()=>void apply()}>Apply album info</button>}
        {!missingKey && <button className="secondary" disabled={busy} onClick={()=>void search()}>{preview?"Search again":"Retry lookup"}</button>}
        <button className="secondary" onClick={onClose}>Cancel</button>
      </div>
    </div>
  </Dialog>;
}
