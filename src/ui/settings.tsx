import { useEffect, useState } from "react";
import { FolderPlus, RefreshCw, Square, Trash2 } from "lucide-react";
import { api, type AppPreferences, type CloseBehavior } from "../native";
import { useMuse } from "../store";
import { Dialog, Empty, Heading } from "./shared";
import { MusicAnalysisSection } from "./music-analysis";
import { AiSettingsSection } from "./ai";
import type { SourceFolder } from "../types";

export function SettingsScreen() {
  const sources = useMuse((s) => s.library.sources),
    issues = useMuse((s) => s.library.issues),
    scan = useMuse((s) => s.scan),
    mediaControls = useMuse((s) => s.playback.mediaControls);
  const [removing, setRemoving] = useState<SourceFolder | null>(null),
    [busy, setBusy] = useState(false);
  const [preferences, setPreferences] = useState<AppPreferences | null>(null);
  const [savingPreference, setSavingPreference] = useState(false);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const [preferenceLoad, setPreferenceLoad] = useState(0);
  useEffect(() => {
    let active = true;
    api
      .preferences()
      .then((value) => {
        if (active) setPreferences(value);
      })
      .catch((error: unknown) => {
        if (active) setPreferenceError(String(error));
      });
    return () => {
      active = false;
    };
  }, [preferenceLoad]);
  async function saveCloseBehavior(behavior: CloseBehavior) {
    if (!preferences || savingPreference) return;
    setSavingPreference(true);
    setPreferenceError(null);
    try {
      await api.setCloseBehavior(behavior);
      setPreferences({ ...preferences, closeBehavior: behavior });
    } catch (error) {
      setPreferenceError(String(error));
    } finally {
      setSavingPreference(false);
    }
  }
  async function remove() {
    if (!removing || busy) return;
    setBusy(true);
    try {
      await api.removeFolder(removing.id);
      await useMuse.getState().refresh();
      setRemoving(null);
    } catch (e) {
      useMuse.getState().fail(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading overline="MUSE PREFERENCES" title="Settings.">
        Manage your music sources and playback preferences.
      </Heading>
      <h2 className="section-title">Local music folders</h2>
      <p className="sub">Muse indexes your music in place. Your original files stay in your folders.</p>
      <div className="actions">
        <button className="primary" onClick={() => void useMuse.getState().importFolders()}><FolderPlus size={14}/>Add folders</button>
        <button
          className="secondary"
          disabled={scan.running}
          onClick={() => void api.rescan().catch(useMuse.getState().fail)}
        >
          <RefreshCw size={14} />
          Rescan folders
        </button>
        {scan.running && (
          <button
            className="secondary"
            onClick={() => void api.stopScan().catch(useMuse.getState().fail)}
          >
            <Square size={12} />
            Stop scan
          </button>
        )}
      </div>
      {!scan.running && scan.message && (
        <p className="sub scan-summary" role="status">
          {scan.message}
        </p>
      )}
      {issues.length > 0 && (
        <section className="scan-issues">
          <h2 className="section-title">Files needing attention</h2>
          <p className="sub">
            Muse skipped these files. Check that they are complete and readable,
            then rescan. Showing up to 100 issues.
          </p>
          <ul>
            {issues.map((issue) => (
              <li key={issue.path}>
                <p>{issue.path}</p>
                <span className="muted">{issue.error}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {sources.length ? (
        <div className="source-list">
          {sources.map((source) => (
            <article className="source-row" key={source.id}>
              <div>
                <h2>{source.path}</h2>
                <p className={source.available ? "muted" : "warning"}>
                  {source.available
                    ? "Connected"
                    : "Unavailable — reconnect this drive"}
                  {source.lastScan
                    ? ` · Last scanned ${new Date(source.lastScan * 1000).toLocaleString()}`
                    : ""}
                </p>
                {source.error && <p className="warning">{source.error}</p>}
              </div>
              <button
                className="iconbtn"
                disabled={scan.running}
                aria-label={`Remove folder ${source.path}`}
                onClick={() => setRemoving(source)}
              >
                <Trash2 size={16} />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <Empty title="No music folders yet.">
          <button
            className="primary"
            onClick={() => void useMuse.getState().importFolders()}
          >
            Choose your music folders
          </button>
        </Empty>
      )}
      <section
        className="background-settings"
        aria-labelledby="remote-music-heading"
      >
        <h2 id="remote-music-heading" className="section-title">
          Remote music
        </h2>
        <p className="sub">
          Connect a remote music folder using SSH and your existing key.
        </p>
        <button
          className="secondary"
          onClick={() => useMuse.getState().navigate("sftp")}
        >
          Manage SSH / SFTP
        </button>
      </section>
      <section
        className="background-settings"
        aria-labelledby="background-heading"
      >
        <h2 id="background-heading" className="section-title">
          Background playback
        </h2>
        <fieldset
          className="close-preferences"
          disabled={!preferences || savingPreference}
          aria-describedby={
            preferenceError
              ? "background-description background-error"
              : "background-description"
          }
        >
          <legend>When closing the window</legend>
          {(
            [
              ["background", "Keep running in background"],
              ["quit", "Quit Muse"],
            ] as const
          ).map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name="close-behavior"
                value={value}
                checked={(preferences?.closeBehavior ?? "quit") === value}
                disabled={
                  value === "background" && !preferences?.backgroundAvailable
                }
                onChange={() => void saveCloseBehavior(value)}
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
        <p id="background-description" className="sub">
          {preferences && !preferences.backgroundAvailable
            ? "The system tray is unavailable. Muse will quit when you close the window. Restart Muse to retry."
            : "Keep listening with the window closed. Use the Muse tray or menu bar icon to return, control playback or quit."}
        </p>
        {!preferences && !preferenceError && (
          <p role="status" className="muted">
            Loading preference…
          </p>
        )}
        {savingPreference && (
          <p role="status" className="muted">
            Saving…
          </p>
        )}
        {preferenceError && (
          <>
            <p id="background-error" role="alert" className="warning">
              Could not {preferences ? "save" : "load"} the close preference:{" "}
              {preferenceError}
            </p>
            {!preferences && (
              <button
                className="secondary"
                onClick={() => {
                  setPreferenceError(null);
                  setPreferenceLoad((value) => value + 1);
                }}
              >
                Retry loading preference
              </button>
            )}
          </>
        )}
      </section>

      <MusicAnalysisSection/>
      <AiSettingsSection/>
      <h2 className="section-title">Keyboard shortcuts</h2>
      <dl className="shortcuts">
        {[
          ["Space", "Play / pause"],
          ["← / →", "Seek 5 seconds"],
          ["⌘ / Ctrl + ← / →", "Previous / next track"],
          ["↑ / ↓", "Volume"],
          ["S", "Shuffle"],
          ["R", "Cycle repeat"],
          ["M", "Mute / unmute"],
        ].map(([key, label]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{label}</dd>
          </div>
        ))}
      </dl>
      <p className="sub">
        System media controls:{" "}
        {mediaControls ? "connected" : "not available on this system"}.
        Shortcuts are active when you are not editing a field or using a dialog.
      </p>
      <h2 className="section-title">About Muse</h2>
      <p className="sub">
        Muse 0.1 · Local music, on your terms.
        <br />
        Your catalog, cached artwork, playlists and history are stored in this
        app’s local data folder. MP3, FLAC, WAV, AAC/M4A and ALAC decoding is
        provided by the native audio engine.
      </p>
      {removing && (
        <Dialog
          title="Remove this music folder?"
          onClose={() => setRemoving(null)}
        >
          <p className="sub">{removing.path}</p>
          <p>
            Songs found only in this folder will be removed from your library,
            playlists, favourites and history. Songs with another source stay
            available. Your original music files stay in place.
          </p>
          <div className="actions">
            <button className="secondary" onClick={() => setRemoving(null)}>
              Cancel
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void remove()}
            >
              Remove folder
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
