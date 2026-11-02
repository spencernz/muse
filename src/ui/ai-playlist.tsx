import { useEffect, useRef, useState } from "react";
import { Cloud, LoaderCircle, Moon, Music2, Shuffle, Smile, Sparkles, Sun, Target, Waves, Zap } from "lucide-react";
import { musicAnalysis } from "../music-analysis";
import { ai, aiMessage } from "../ai";
import { useMuse } from "../store";
import { Dialog } from "./shared";
import { moods, randomMoods } from "../playlist-moods";

export function AiPlaylistDialog({ onClose, initialMood = "" }: { onClose: () => void; initialMood?: string }) {
  const [choices, setChoices] = useState(() => {
    const initial = moods.find(m => m.name === initialMood);
    return initial ? [initial, ...randomMoods(moods.filter(m => m !== initial)).slice(0, 3)] : randomMoods();
  });
  const [selected, setSelected] = useState(() => moods.some(m => m.name === initialMood) ? initialMood : "");
  const [settings, setSettings] = useState<{configured:boolean} | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const working = useRef(false), alive = useRef(false);
  const tracks = useMuse((s) => s.library.tracks);
  useEffect(() => {
    alive.current = true;
    let active = true;
    void musicAnalysis.status().then(value => { if (active) setSettings({configured:value.analysed>0}); })
      .catch(e => { if (active) setError(aiMessage(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; alive.current = false; };
  }, []);
  async function generate() {
    if (working.current || !selected || !settings?.configured || !tracks) return;
    working.current = true; setBusy(true); setError(null);
    try {
      const created = await ai.generatePlaylist(selected);
      // The native command has committed the complete playlist before returning.
      useMuse.setState(s => ({ library: { ...s.library, playlists: [...s.library.playlists.filter(p => p.id !== created.id), created] }, revision: s.revision + 1, search: "" }));
      useMuse.getState().navigate("playlist", created.id);
      if (alive.current) onClose();
      void useMuse.getState().refresh();
    } catch (e) { if (alive.current) setError(aiMessage(e)); }
    finally { working.current = false; if (alive.current) setBusy(false); }
  }
  function shuffle() {
    // Cycle to the other four so refresh always offers different moods.
    setChoices(randomMoods(moods.filter(m => !choices.some(c => c.name === m.name))));
    setSelected("");
  }
  return <Dialog title="Create AI playlist" onClose={onClose} dismissible={!busy}>
    <form className="ai-playlist-form" onSubmit={e => { e.preventDefault(); void generate(); }}>
      <p className="sub">Choose a mood. Build a mix of up to 20 tracks using saved local audio profiles.</p>
      <fieldset disabled={busy || loading} className="mood-fieldset">
        <legend>Pick a mood</legend>
        <div className="mood-options">{choices.map(mood => <label className={`mood-option ${selected === mood.name ? "selected" : ""}`} key={mood.name}>
          <input type="radio" name="mood" aria-label={mood.name} value={mood.name} checked={selected === mood.name} onChange={() => setSelected(mood.name)} />
          <span><strong>{mood.name}</strong><small>{mood.detail}</small></span>
        </label>)}</div>
        <button type="button" className="secondary" onClick={shuffle}><Shuffle size={16} />Show other moods</button>
      </fieldset>
      <p className="sub">Music stays local. Standard mood mixes use saved audio profiles without an OpenAI request. Fewer tracks are selected when confident matches are scarce.</p>
      {loading && <p role="status">Checking track profiles…</p>}
      {!loading && settings && !settings.configured && <p>Analyse music in Settings → Music analysis before creating mood playlists.</p>}
      {!tracks && <p role="status">Import music or connect a music source before creating a mix.</p>}
      {error && <p role="alert" className="notice notice-error">{error}</p>}
      {busy && <p role="status"><LoaderCircle className="spin" size={16} /> Choosing tracks for your {selected.toLowerCase()} mix…</p>}
      <div className="actions">
        <button type="submit" className="primary" disabled={busy || loading || !settings?.configured || !selected || !tracks}><Sparkles size={16} />{busy ? "Generating…" : "Generate playlist"}</button>
        <button type="button" className="secondary" disabled={busy} onClick={onClose}>Cancel</button>
        {!loading && (!settings?.configured || error) && <button type="button" className="secondary" disabled={busy} onClick={() => { onClose(); useMuse.getState().navigate("settings", "analysis"); }}>Open music analysis</button>}
      </div>
    </form>
  </Dialog>;
}

export function AiDjSuggestions() {
  const [choices, setChoices] = useState(randomMoods);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const tracks = useMuse(s => s.library.tracks);
  const icons = { sun: Sun, waves: Waves, music: Music2, target: Target, zap: Zap, moon: Moon, cloud: Cloud, smile: Smile };
  async function generate(mood: string) {
    if (running.current) return;
    if (!tracks) { setError("Import music or connect a music source before creating a mix."); return; }
    running.current = true; setBusy(mood); setError(null);
    try {
      const session = await ai.startDj(mood);
      useMuse.setState({playback:session.playback,notice:`AI DJ · ${session.mood} · ${session.tracks} tracks · ${Math.round(session.duration/60)} min${session.shorter?" · Shorter session: fewer suitable tracks available":""}`});
      useMuse.getState().navigate("now");
    } catch (e) { setError(aiMessage(e)); }
    finally { running.current = false; setBusy(null); }
  }
  return <section className="ai-mood-section" aria-labelledby="ai-mood-title">
    <div className="ai-mood-heading">
      <div><h2 id="ai-mood-title" className="section-title">AI DJ</h2><p className="sub">Choose a mood. Start about an hour of music from your analysed library.</p></div>
      <button className="secondary" onClick={() => setChoices(randomMoods(moods.filter(m => !choices.some(c => c.name === m.name))))}><Shuffle size={16} />Show other moods</button>
    </div>
    <div className="ai-mood-tiles">{choices.map(mood => { const Icon = icons[mood.icon]; return <button key={mood.name} className={`ai-mood-tile tone-${mood.tone}`} disabled={busy !== null} onClick={() => void generate(mood.name)} aria-label={`Start ${mood.name.toLowerCase()} DJ`}>
      {busy === mood.name ? <LoaderCircle className="spin" size={22} aria-hidden="true" /> : <Icon size={22} aria-hidden="true" />}<span><strong>{mood.name}</strong><small>{mood.detail}</small></span>
    </button>; })}</div>
    {busy && <p className="ai-mood-status" role="status">Starting your {busy.toLowerCase()} DJ session…</p>}
    {error && <div className="ai-mood-error" role="alert"><span>{error}</span>{error.toLowerCase().includes("analysis") && <button className="secondary" onClick={() => useMuse.getState().navigate("settings", "analysis")}>Open music analysis</button>}</div>}
  </section>;
}
