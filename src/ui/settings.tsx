import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  FolderPlus,
  Info,
  Keyboard,
  Library,
  Monitor,
  Moon,
  RefreshCw,
  Server,
  SlidersHorizontal,
  Sparkles,
  Square,
  Sun,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { api, type AppPreferences, type CloseBehavior } from "../native";
import { useMuse } from "../store";
import { useAppearance, type Appearance } from "../appearance";
import { sftp, type SftpState } from "../sftp";
import { Dialog, Empty, Heading } from "./shared";
import { MusicAnalysisSection } from "./music-analysis";
import { AiSettingsSection } from "./ai";
import type { SourceFolder } from "../types";

type SettingsCategory =
  | "general"
  | "library"
  | "intelligence"
  | "shortcuts"
  | "about";
const categories: [SettingsCategory, string, string, LucideIcon][] = [
  ["general", "General", "Appearance and window", SlidersHorizontal],
  ["library", "Library", "Music folders and remote music", Library],
  ["intelligence", "Intelligence", "Music analysis and AI", Sparkles],
  ["shortcuts", "Shortcuts", "Keyboard and media keys", Keyboard],
  ["about", "About", "Version and storage", Info],
];
/** Settings links pass a context: a category name, or a section inside one. */
function categoryFor(context: string): SettingsCategory | null {
  if (context === "analysis" || context === "ai") return "intelligence";
  if (context === "sources" || context === "remote") return "library";
  return categories.some(([id]) => id === context)
    ? (context as SettingsCategory)
    : null;
}
// Remembered for this session so Back to Settings returns to the same category.
let lastCategory: SettingsCategory = "general";

export function SettingsScreen() {
  const context = useMuse((s) => s.context);
  const [category, setCategory] = useState<SettingsCategory>(
    () => categoryFor(context) ?? lastCategory,
  );
  useEffect(() => {
    const linked = categoryFor(context);
    if (linked) setCategory(linked);
  }, [context]);
  useEffect(() => {
    lastCategory = category;
  }, [category]);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = categories.findIndex(([id]) => id === category);
    const next = {
      ArrowDown: index + 1,
      ArrowRight: index + 1,
      ArrowUp: index - 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: categories.length - 1,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const target = (next + categories.length) % categories.length;
    setCategory(categories[target][0]);
    tabs.current[target]?.focus();
  }
  return (
    <div className="settings-page">
      <Heading overline="MUSE PREFERENCES" title="Settings.">
        Choose how Muse looks, where your music comes from and how it plays.
      </Heading>
      <div className="settings-layout">
        <div
          className="settings-tabs"
          role="tablist"
          aria-label="Settings categories"
          aria-orientation="vertical"
          onKeyDown={onKeyDown}
        >
          {categories.map(([id, label, description, Icon], index) => (
            <button
              key={id}
              ref={(element) => {
                tabs.current[index] = element;
              }}
              id={`settings-tab-${id}`}
              role="tab"
              aria-selected={category === id}
              aria-controls={`settings-panel-${id}`}
              tabIndex={category === id ? 0 : -1}
              onClick={() => setCategory(id)}
            >
              <Icon size={18} aria-hidden="true" />
              <span>
                {label}
                <small>{description}</small>
              </span>
            </button>
          ))}
        </div>
        <div
          className="settings-panel"
          role="tabpanel"
          id={`settings-panel-${category}`}
          aria-labelledby={`settings-tab-${category}`}
          tabIndex={0}
        >
          {category === "general" && <GeneralPanel />}
          {category === "library" && <LibraryPanel />}
          {category === "intelligence" && (
            <>
              <MusicAnalysisSection />
              <AiSettingsSection />
            </>
          )}
          {category === "shortcuts" && <ShortcutsPanel />}
          {category === "about" && <AboutPanel />}
        </div>
      </div>
    </div>
  );
}

function Group({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="settings-group" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className="section-title">
        {title}
      </h2>
      {description && <p className="sub">{description}</p>}
      {children}
    </section>
  );
}

const appearances: [Appearance, string, string, LucideIcon][] = [
  ["system", "System", "Follow your device", Monitor],
  ["light", "Light", "Bright surfaces", Sun],
  ["dark", "Dark", "The classic Muse look", Moon],
];
function GeneralPanel() {
  const { appearance, scheme, setAppearance } = useAppearance();
  return (
    <>
      <Group
        id="appearance"
        title="Appearance"
        description="Now Playing stays dark in every appearance so album artwork stands out."
      >
        <fieldset className="appearance-options">
          <legend className="visually-hidden">Appearance</legend>
          {appearances.map(([value, label, description, Icon]) => (
            <label key={value} className={`appearance-option appearance-${value}`}>
              <input
                type="radio"
                name="appearance"
                value={value}
                checked={appearance === value}
                onChange={() => setAppearance(value)}
              />
              <span className="appearance-preview" aria-hidden="true">
                <i />
                <i />
              </span>
              <span className="appearance-label">
                <Icon size={16} aria-hidden="true" />
                {label}
              </span>
              <small>
                {value === "system"
                  ? `${description} · now ${scheme}`
                  : description}
              </small>
            </label>
          ))}
        </fieldset>
      </Group>
      <ClosePreference />
    </>
  );
}

function ClosePreference() {
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
  return (
    <Group id="background" title="Background playback">
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
    </Group>
  );
}

function LibraryPanel() {
  const sources = useMuse((s) => s.library.sources),
    issues = useMuse((s) => s.library.issues),
    scan = useMuse((s) => s.scan);
  const [removing, setRemoving] = useState<SourceFolder | null>(null),
    [busy, setBusy] = useState(false);
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
      <Group
        id="local-folders"
        title="Local music folders"
        description="Muse indexes your music in place. Your original files stay in your folders."
      >
        {sources.length ? (
          <div className="source-list">
            {sources.map((source) => (
              <article className="source-row" key={source.id}>
                <div>
                  <h3>{source.path}</h3>
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
                  title="Remove folder"
                  onClick={() => setRemoving(source)}
                >
                  <Trash2 size={16} />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <Empty title="No music folders yet.">
            <p className="sub">Add a folder to start your library.</p>
          </Empty>
        )}
        <div className="actions">
          <button
            className="primary"
            onClick={() => void useMuse.getState().importFolders()}
          >
            <FolderPlus size={14} />
            Add folders
          </button>
          <button
            className="secondary"
            disabled={scan.running || !sources.length}
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
      </Group>
      {issues.length > 0 && (
        <Group
          id="scan-issues"
          title="Files needing attention"
          description="Muse skipped these files. Check that they are complete and readable, then rescan. Showing up to 100 issues."
        >
          <ul className="scan-issues">
            {issues.map((issue) => (
              <li key={issue.path}>
                <p>{issue.path}</p>
                <span className="muted">{issue.error}</span>
              </li>
            ))}
          </ul>
        </Group>
      )}
      <RemoteMusic />
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

function RemoteMusic() {
  const [state, setState] = useState<SftpState | null | undefined>();
  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(() => sftp.state())
      .then((value) => {
        if (active) setState(value ?? null);
      })
      .catch(() => {
        if (active) setState(null);
      });
    return () => {
      active = false;
    };
  }, []);
  const profile = state?.profile;
  return (
    <Group
      id="remote-music"
      title="Remote music"
      description="Play music from a server or NAS over SSH. Sign in with a password or an SSH key; audio stays on the server."
    >
      <div className="settings-summary">
        <Server size={20} aria-hidden="true" />
        <p>
          {state === undefined
            ? "Checking remote music…"
            : profile
              ? `${profile.username}@${profile.host} · ${profile.root}`
              : "No remote music server set up."}
        </p>
      </div>
      <button
        className="secondary"
        onClick={() => useMuse.getState().navigate("sftp")}
      >
        Manage SSH / SFTP
      </button>
    </Group>
  );
}

function ShortcutsPanel() {
  const mediaControls = useMuse((s) => s.playback.mediaControls);
  return (
    <>
      <Group
        id="keyboard"
        title="Keyboard shortcuts"
        description="Shortcuts work when you are not editing a field or using a dialog."
      >
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
              <dt>
                <kbd>{key}</kbd>
              </dt>
              <dd>{label}</dd>
            </div>
          ))}
        </dl>
      </Group>
      <Group id="media-keys" title="System media controls">
        <p className="settings-summary">
          {mediaControls
            ? "Connected. Media keys and your system’s playback controls work with Muse."
            : "Not available on this system."}
        </p>
      </Group>
    </>
  );
}

function AboutPanel() {
  return (
    <Group id="about" title="Muse 0.1">
      <p className="sub">
        Local music, on your terms. Your catalog, cached artwork, playlists and
        history are stored in this app’s local data folder. MP3, FLAC, WAV,
        AAC/M4A and ALAC decoding is provided by the native audio engine.
      </p>
    </Group>
  );
}
