import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  FileMusic,
  Folder,
  KeyRound,
  RefreshCw,
  Server,
  Unplug,
} from "lucide-react";
import {
  sftp,
  sftpMessage,
  type HostChallenge,
  type KeyMismatch,
  type SftpConfig,
  type SftpConnectResult,
  type SftpState,
  type RemoteSyncStatus,
} from "../sftp";
import { Dialog, Heading } from "./shared";
import { useMuse } from "../store";

const blank: SftpConfig = {
  host: "",
  port: 22,
  username: "",
  root: "/",
  identityFile: null,
};
const statusLabels = {
  disconnected: "Not connected",
  configured: "Saved connection · reconnect to check",
  connected: "Connected",
  error: "Connection needs attention",
};
function sizeLabel(size: number | null) {
  if (size === null) return "—";
  const unit = size >= 1024 * 1024 ? "MB" : "KB";
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(size / (unit === "MB" ? 1024 * 1024 : 1024))} ${unit}`;
}
function AutomaticSync(){
 const [settings,setSettings]=useState<import('../sftp').AutoSync|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 useEffect(()=>{let active=true;void sftp.autoSync().then(value=>{if(active)setSettings(value);}).catch(()=>{if(active)setError("Could not load automatic sync settings. Reopen this page to retry.");});return()=>{active=false;};},[]);
 async function save(value:import('../sftp').AutoSync){setBusy(true);setError(null);try{setSettings(await sftp.saveAutoSync(value));}catch{setError("Could not save automatic sync. Try again.");}finally{setBusy(false);}}
 return <div className="auto-sync-settings"><div className="actions"><label><input type="checkbox" checked={settings?.enabled??false} disabled={!settings||busy} onChange={event=>{if(settings)void save({...settings,enabled:event.target.checked});}}/> Sync automatically</label><label>Check every <select aria-label="Automatic sync interval" value={settings?.intervalMinutes??15} disabled={!settings||busy} onChange={event=>{if(settings)void save({...settings,intervalMinutes:Number(event.target.value)});}}>{[5,15,30,60].map(value=><option key={value} value={value}>{value} minutes</option>)}</select></label></div><p className="sub">While Muse runs, check for new and changed music. Unchanged files are skipped; audio stays on the server.</p>{error&&<p role="alert" className="provider-error">{error}</p>}</div>;
}
export function SftpScreen() {
  const [sync, setSync] = useState<RemoteSyncStatus | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [state, setState] = useState<SftpState | null>(null);
  const [config, setConfig] = useState<SftpConfig>(blank);
  const [auth, setAuth] = useState<"agent" | "file">("agent");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<HostChallenge | null>(null);
  const [verified, setVerified] = useState(false);
  const [reset, setReset] = useState<KeyMismatch | null>(null);
  const alive = useRef(false);
  const working = useRef(false);
  const pending = useRef<string | null>(null);
  const errorMessage = useRef<HTMLParagraphElement>(null);
  function hydrate(value: SftpState) {
    setState(value);
    if (value.profile) {
      setConfig(value.profile);
      setAuth(value.profile.identityFile ? "file" : "agent");
    }
  }
  useEffect(() => {
    let active = true;
    alive.current = true;
    void sftp
      .state()
      .then((value) => {
        if (active) hydrate(value);
      })
      .catch((e) => {
        if (active) setError(sftpMessage(e));
      });
    return () => {
      active = false;
      alive.current = false;
      if (pending.current)
        void sftp.cancelHost(pending.current).catch(() => {});
    };
  }, []);
  useEffect(() => {
    let active = true;
    let polling = false;
    async function refresh() {
      if (polling) return;
      polling = true;
      try {
        const value = await sftp.syncStatus();
        if (active && value) setSync(value);
      } catch { if (active) setSyncError("Could not check Sync progress. Reopen this page to retry."); }
      finally { polling = false; }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 1000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  useEffect(() => {
    const message = errorMessage.current;
    if (!error || !message) return;
    message.focus({ preventScroll: true });
    const content = message.closest<HTMLElement>("#main-content");
    if (content)
      content.scrollTo({
        top: Math.max(
          0,
          content.scrollTop +
            message.getBoundingClientRect().top -
            content.getBoundingClientRect().top -
            16,
        ),
        behavior: "auto",
      });
  }, [error]);
  async function run(label: string, action: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (e) {
      if (alive.current) {
        setReset(null);
        setError(sftpMessage(e));
        try {
          const latest = await sftp.state();
          if (alive.current) setState(latest);
        } catch {
          /* Keep safe original feedback. */
        }
      }
    } finally {
      working.current = false;
      if (alive.current) setBusy(null);
    }
  }
  async function update(action: () => Promise<SftpState>) {
    const value = await action();
    if (alive.current) setState(value);
  }
  async function connection(action: () => Promise<SftpConnectResult>) {
    const result = await action();
    if (!alive.current) {
      if (result.challenge) await sftp.cancelHost(result.challenge.id);
      return;
    }
    setState(result.state);
    if (result.challenge) {
      pending.current = result.challenge.id;
      setVerified(false);
      setChallenge(result.challenge);
    } else {
      hydrate(result.state);
      setNotice("SSH connection checked.");
    }
  }
  async function cancelChallenge() {
    if (!challenge || working.current) return;
    const id = challenge.id;
    setChallenge(null);
    pending.current = null;
    await run("Cancelling verification…", () => sftp.cancelHost(id));
  }
  const disabled = !!busy || !!challenge || !!sync?.running || syncBusy;
  const listing = state?.listing;
  return (
    <div className="provider-page sftp-page">
      <Heading overline="MUSIC SOURCE" title="SSH / SFTP.">
        Connect your remote music folder using an SSH key.
      </Heading>
      <section
        className="provider-section"
        aria-labelledby="sftp-status-heading"
      >
        <div className="provider-status-row">
          <Server size={24} aria-hidden="true" />
          <div>
            <h2 id="sftp-status-heading" className="section-title">
              Connection
            </h2>
            <p role="status">
              {state
                ? statusLabels[state.status]
                : error
                  ? "Connection unavailable"
                  : "Loading SSH connection…"}
            </p>
          </div>
        </div>
        {state?.profile && (
          <dl className="provider-details">
            <div>
              <dt>Server</dt>
              <dd>
                {state.profile.host}:{state.profile.port}
              </dd>
            </div>
            <div>
              <dt>Account</dt>
              <dd>{state.profile.username}</dd>
            </div>
            <div>
              <dt>Music folder</dt>
              <dd>{state.profile.root}</dd>
            </div>
          </dl>
        )}
        <div className="actions">
          {state?.profile && (
            <>
              <button
                className="secondary"
                disabled={disabled}
                onClick={() =>
                  void run("Checking connection…", () =>
                    connection(sftp.reconnect),
                  )
                }
              >
                Test connection
              </button>
              <button
                className="secondary"
                disabled={disabled}
                onClick={() =>
                  void run("Reconnecting…", () => connection(sftp.reconnect))
                }
              >
                <RefreshCw size={16} />
                Reconnect
              </button>
              <button
                className="secondary"
                disabled={disabled}
                onClick={() =>
                  void run("Disconnecting…", async () => {
                    await update(sftp.disconnect);
                    if (alive.current) {
                      setConfig(blank);
                      setAuth("agent");
                      setNotice(
                        "SSH disconnected. Your private keys and local music were not changed.",
                      );
                    }
                  })
                }
              >
                <Unplug size={16} />
                Disconnect SSH
              </button>
            </>
          )}
          {!state && (
            <button
              className="secondary"
              disabled={disabled}
              onClick={() =>
                void run("Loading connection…", async () => {
                  const value = await sftp.state();
                  if (alive.current) hydrate(value);
                })
              }
            >
              Retry connection settings
            </button>
          )}
        </div>
        {busy && (
          <p className="sub" role="status">
            {busy}
          </p>
        )}
        {error && (
          <p
            ref={errorMessage}
            id="sftp-error"
            className="warning"
            role="alert"
            tabIndex={-1}
          >
            {error}
          </p>
        )}
        {notice && (
          <p className="sub" role="status">
            {notice}
          </p>
        )}
        {state?.keyMismatch && (
          <button
            className="secondary"
            disabled={disabled}
            onClick={() => {
              setVerified(false);
              setReset(state.keyMismatch);
            }}
          >
            Review changed server key
          </button>
        )}
      </section>
      <section
        className="provider-section"
        aria-labelledby="sftp-server-heading"
      >
        <h2 id="sftp-server-heading" className="section-title">
          SSH server
        </h2>
        <form
          className="provider-form"
          aria-describedby={error ? "sftp-error" : undefined}
          onSubmit={(event) => {
            event.preventDefault();
            void run("Connecting to SSH…", () =>
              connection(() =>
                sftp.connect({
                  ...config,
                  identityFile: auth === "agent" ? null : config.identityFile,
                }),
              ),
            );
          }}
        >
          <label htmlFor="sftp-host">Host</label>
          <input
            id="sftp-host"
            value={config.host}
            onChange={(e) => setConfig({ ...config, host: e.target.value })}
            placeholder="music.example.com"
            maxLength={253}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            disabled={disabled}
            required
          />
          <label htmlFor="sftp-port">SSH port</label>
          <input
            id="sftp-port"
            type="number"
            min={1}
            max={65535}
            step={1}
            value={config.port || ""}
            onChange={(e) =>
              setConfig({ ...config, port: Number(e.target.value) })
            }
            disabled={disabled}
            required
          />
          <label htmlFor="sftp-user">Username</label>
          <input
            id="sftp-user"
            value={config.username}
            onChange={(e) => setConfig({ ...config, username: e.target.value })}
            maxLength={128}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            disabled={disabled}
            required
          />
          <label htmlFor="sftp-root">Remote folder</label>
          <input
            id="sftp-root"
            value={config.root}
            onChange={(e) => setConfig({ ...config, root: e.target.value })}
            placeholder="/path/to/Music"
            maxLength={4096}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            disabled={disabled}
            required
          />
          <label htmlFor="sftp-auth">SSH key</label>
          <select
            id="sftp-auth"
            value={auth}
            onChange={(e) => setAuth(e.target.value as "agent" | "file")}
            disabled={disabled}
          >
            <option value="agent">SSH agent</option>
            <option value="file">Private key file</option>
          </select>
          {auth === "file" && (
            <div className="sftp-key-picker">
              <p className="sub">
                {config.identityFile ??
                  "Choose the private key matching the public key on the server."}
              </p>
              <button
                type="button"
                className="secondary"
                disabled={disabled}
                onClick={() =>
                  void run("Choosing SSH key…", async () => {
                    const path = await sftp.pickKey();
                    if (path && alive.current)
                      setConfig((current) => ({
                        ...current,
                        identityFile: path,
                      }));
                  })
                }
              >
                <KeyRound size={16} />
                Choose private key
              </button>
            </div>
          )}
          <p className="sub">
            Your friend adds your public key to the server. Keep the private key
            on this computer. For an encrypted key, unlock it in your SSH agent
            first.
          </p>
          <button
            className="primary"
            disabled={
              disabled || !state || (auth === "file" && !config.identityFile)
            }
          >
            Connect SSH
          </button>
        </form>
      </section>
      <section className="provider-section" aria-labelledby="sftp-sync-heading">
        <h2 id="sftp-sync-heading" className="section-title">Sync remote catalog</h2>
        <AutomaticSync/>
        <p className="sub">Sync reads this folder and its subfolders into your library. Only metadata and artwork are saved here. Music plays from the server.</p>
        {state?.profile && <p className="sftp-path">{state.profile.root}</p>}
        <div className="actions">
          <button className="primary" disabled={disabled || !state?.profile} onClick={() => {
            setSyncBusy(true); setSyncError(null);
            void sftp.syncStart().then(setSync).catch((e: unknown) => setSyncError(typeof e === "string" ? e : "Could not start Sync. Reconnect SSH and retry.")).finally(() => setSyncBusy(false));
          }}><RefreshCw size={16} />{syncBusy ? "Starting Sync…" : "Sync catalog"}</button>
          {sync?.running && <button className="secondary" disabled={syncBusy} onClick={() => {
            setSyncBusy(true);
            void sftp.syncCancel().catch(() => setSyncError("Could not cancel Sync. Try again.")).finally(() => setSyncBusy(false));
          }}>Cancel Sync</button>}
          <button className="secondary" onClick={() => useMuse.getState().navigate("library")}>Open library</button>
        </div>
        {sync?.running && <progress aria-label="Syncing remote catalog" />}
        <p role="status">{sync?.message || "Choose a folder, then Sync to find your remote music."}</p>
        {!!sync?.scanned && <p className="sub">{sync.indexed.toLocaleString()} indexed · {(sync.unchanged??0).toLocaleString()} unchanged · {sync.skipped.toLocaleString()} unreadable tags skipped</p>}
        {sync?.completedAt && <p className="sub">Last synced {new Date(sync.completedAt * 1000).toLocaleString()}</p>}
        {(syncError || sync?.error) && <p role="alert" className="provider-error">{syncError || sync?.error}</p>}
      </section>
      <section
        className="provider-section"
        aria-labelledby="sftp-folders-heading"
      >
        <h2 id="sftp-folders-heading" className="section-title">
          Remote music folder
        </h2>
        {listing ? (
          <>
            <p className="sftp-path">
              {listing.root}
              {listing.relative
                ? `${listing.root.endsWith("/") ? "" : "/"}${listing.relative}`
                : ""}
            </p>
            <div className="actions">
              <button
                className="secondary"
                disabled={disabled || listing.parent === null}
                onClick={() =>
                  void run("Opening parent folder…", () =>
                    update(() => sftp.browse(listing.parent ?? "")),
                  )
                }
              >
                <ArrowUp size={16} />
                Up one folder
              </button>
              <button
                className="secondary"
                disabled={disabled}
                onClick={() =>
                  void run("Refreshing folder…", () =>
                    update(() => sftp.browse(listing.relative)),
                  )
                }
              >
                <RefreshCw size={16} />
                Refresh folder
              </button>
              <button
                className="primary"
                disabled={disabled}
                onClick={() =>
                  void run("Saving music folder…", async () => {
                    const value = await sftp.chooseFolder(listing.relative);
                    if (alive.current) {
                      hydrate(value);
                      setNotice("Remote music folder saved.");
                    }
                  })
                }
              >
                Use this music folder
              </button>
            </div>
            {listing.entries.length ? (
              <div
                className="sftp-list"
                role="table"
                aria-label="Remote music files"
              >
                {listing.entries.map((entry) => (
                  <div className="sftp-file" role="row" key={entry.name}>
                    <div role="cell">
                      {entry.kind === "directory" ? (
                        <button
                          className="text-link"
                          disabled={disabled}
                          aria-label={`Open ${entry.name}`}
                          onClick={() =>
                            void run("Opening folder…", () =>
                              update(() =>
                                sftp.browse(
                                  listing.relative
                                    ? `${listing.relative}/${entry.name}`
                                    : entry.name,
                                ),
                              ),
                            )
                          }
                        >
                          <Folder size={18} aria-hidden="true" />
                          {entry.name}
                        </button>
                      ) : (
                        <span>
                          {entry.kind === "file" && (
                            <FileMusic size={18} aria-hidden="true" />
                          )}
                          {entry.name}
                        </span>
                      )}
                    </div>
                    <span role="cell" className="muted">
                      {entry.kind === "directory"
                        ? "Folder"
                        : entry.kind === "symlink"
                          ? "Link · not followed"
                          : sizeLabel(entry.size)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="sub">
                No music files or subfolders in this folder.
              </p>
            )}
            {listing.truncated && (
              <p className="sub" role="status">
                Showing the first 500 directory entries. Choose a smaller folder
                to see more files.
              </p>
            )}
            <p className="sub">
              Open a folder and choose “Use this music folder”, then Sync its catalog.
              Cloud icons identify music that plays over SSH; keep the server connected.
            </p>
          </>
        ) : (
          <p className="sub">
            {state?.profile
              ? "Reconnect to browse the saved music folder."
              : "Connect a server to browse and choose your music folder."}
          </p>
        )}
      </section>
      <button
        className="secondary"
        onClick={() => useMuse.getState().navigate("library")}
      >
        Return to music library
      </button>
      {challenge && (
        <Dialog
          title="Verify server key"
          onClose={() => void cancelChallenge()}
        >
          <p>
            Confirm this fingerprint with the server owner before connecting to{" "}
            {challenge.host}:{challenge.port}.
          </p>
          <p className="sub">{challenge.key.algorithm}</p>
          <code className="sftp-fingerprint">{challenge.key.fingerprint}</code>
          <label className="sftp-verify">
            <input
              type="checkbox"
              checked={verified}
              disabled={!!busy}
              onChange={(e) => setVerified(e.target.checked)}
            />
            I verified this fingerprint with the server owner
          </label>
          <div className="actions">
            <button
              className="secondary"
              disabled={!!busy}
              onClick={() => void cancelChallenge()}
            >
              Cancel
            </button>
            <button
              className="primary"
              disabled={!verified || !!busy}
              onClick={() =>
                void run("Authenticating SSH key…", async () => {
                  const id = challenge.id;
                  setChallenge(null);
                  pending.current = null;
                  const value = await sftp.confirmHost(id);
                  if (alive.current) {
                    hydrate(value);
                    setNotice("SSH connected. Choose your music folder below.");
                  }
                })
              }
            >
              Trust and connect
            </button>
          </div>
        </Dialog>
      )}
      {reset && (
        <Dialog
          title="Review changed server key"
          onClose={() => {
            if (!working.current) setReset(null);
          }}
        >
          <p>
            {reset.host}:{reset.port}
          </p>
          <p className="sub">Previously trusted</p>
          <code className="sftp-fingerprint">{reset.expected.fingerprint}</code>
          <p className="sub">Server now presents</p>
          <code className="sftp-fingerprint">{reset.observed.fingerprint}</code>
          <label className="sftp-verify">
            <input
              type="checkbox"
              checked={verified}
              disabled={!!busy}
              onChange={(e) => setVerified(e.target.checked)}
            />
            I verified the new fingerprint with the server owner
          </label>
          <div className="actions">
            <button
              className="secondary"
              disabled={!!busy}
              onClick={() => setReset(null)}
            >
              Cancel
            </button>
            <button
              className="primary"
              disabled={!verified || !!busy}
              onClick={() =>
                void run("Resetting server trust…", async () => {
                  await update(() =>
                    sftp.forgetHost(
                      reset.host,
                      reset.port,
                      reset.expected.fingerprint,
                    ),
                  );
                  if (alive.current) {
                    setReset(null);
                    setNotice(
                      "Old server trust removed. Connect again to verify the new key.",
                    );
                  }
                })
              }
            >
              Forget old server key
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
