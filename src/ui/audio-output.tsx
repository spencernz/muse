import { useEffect, useRef, useState } from "react";
import { Airplay, RefreshCw } from "lucide-react";
import { audioOutput, type AudioOutputState } from "../audio-output";
import { Dialog } from "./shared";

function message(error: unknown) {
  return typeof error === "string" ? error : "Could not connect the audio output. Refresh the list and try again.";
}
export function AudioOutputButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  function close() {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
  }
  return <>
    <button ref={trigger} className="iconbtn output-button" aria-label="AirPlay / audio output" aria-haspopup="dialog" aria-expanded={open} title={name ? `Audio output: ${name}` : "AirPlay / audio output"} onClick={() => setOpen(true)}><Airplay size={19} /></button>
    {open && <OutputDialog onClose={close} onSelected={setName} />}
  </>;
}
function OutputDialog({ onClose, onSelected }: { onClose: () => void; onSelected: (name: string) => void }) {
  const [state, setState] = useState<AudioOutputState | null>(null);
  const [choice, setChoice] = useState("system");
  const [busy, setBusy] = useState<string | null>("Loading outputs…");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const alive = useRef(false);
  const working = useRef(false);
  async function run(label: string, action: () => Promise<void>) {
    if (working.current) return;
    working.current = true; setBusy(label); setError(null); setNotice(null);
    try { await action(); } catch (e) { if (alive.current) setError(message(e)); }
    finally { working.current = false; if (alive.current) setBusy(null); }
  }
  function hydrate(value: AudioOutputState) {
    if (!alive.current) return;
    setState(value); setChoice(value.selected); onSelected(value.selectedName);
  }
  useEffect(() => {
    alive.current = true;
    // Run once per open; refresh remains explicit so a draft choice is not replaced.
    void audioOutput.list().then(value => {
      if (alive.current) { setState(value); setChoice(value.selected); setBusy(null); }
    }).catch(e => { if (alive.current) { setError(message(e)); setBusy(null); } });
    return () => { alive.current = false; };
  }, []);
  const missing = !!state && state.selected !== "system" && !state.devices.some(d => d.id === state.selected);
  const valid = !!state && (choice === "system" ? !!state.systemDefaultName : state.devices.some(d => d.id === choice));
  return <Dialog title="AirPlay / audio output" onClose={onClose}>
    <div className="output-picker">
      {busy && <p role="status">{busy}</p>}
      {state && <>
        <p className="output-current" role="status">Current output: <strong>{state.selectedName}</strong>{!state.available && " · unavailable"}</p>
        <label htmlFor="audio-output-device">Play audio through</label>
        <select id="audio-output-device" value={choice} disabled={!!busy} onChange={e => setChoice(e.target.value)}>
          <option value="system" disabled={!state.systemDefaultName}>System default{state.systemDefaultName ? ` · ${state.systemDefaultName}` : " · unavailable"}</option>
          {missing && <option value={state.selected} disabled>Unavailable · {state.selectedName}</option>}
          {state.devices.map(device => <option key={device.id} value={device.id}>{device.name}</option>)}
        </select>
        {!state.devices.length && <p className="sub">No separate audio outputs are available. Connect a speaker, then refresh.</p>}
        <p className="sub">{state.airplaySupported ? "AirPlay speaker not listed? Connect it in macOS Control Center → Sound, then refresh. System default follows your Mac’s selected output." : "AirPlay discovery is available on macOS. Choose an output provided by your operating system here."}</p>
      </>}
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <div className="actions">
        <button className="primary" disabled={!!busy || !valid} onClick={() => void run("Connecting audio output…", async () => {
          const next = await audioOutput.select(choice);
          if (alive.current) { hydrate(next); setNotice(`Audio output connected: ${next.selectedName}.`); }
        })}>Use this output</button>
        <button className="secondary" disabled={!!busy} onClick={() => void run("Refreshing outputs…", async () => hydrate(await audioOutput.list()))}><RefreshCw size={16} />Refresh outputs</button>
        {state?.airplaySupported && <button className="secondary" disabled={!!busy} onClick={() => void run("Opening Sound settings…", () => audioOutput.openSettings())}>Open Sound settings</button>}
      </div>
    </div>
  </Dialog>;
}
