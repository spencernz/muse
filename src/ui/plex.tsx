import { useEffect, useRef, useState } from "react";
import { ExternalLink, RefreshCw, Server, Unplug } from "lucide-react";
import {
  providers,
  providerMessage,
  type PlexAuth,
  type PlexState,
  type PlexVerification,
} from "../providers";
import { useMuse } from "../store";
import { Heading } from "./shared";

const statusLabels: Record<PlexState["status"], string> = {
  disconnected: "Not connected",
  configured: "Saved connection · reconnect to check",
  choose_library: "Server connected · choose a music library",
  connected: "Connected",
  error: "Connection needs attention",
};

export function PlexScreen() {
  const [state, setState] = useState<PlexState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [auth, setAuth] = useState<PlexAuth | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkAgain, setCheckAgain] = useState(0);
  const [server, setServer] = useState("");
  const [library, setLibrary] = useState("");
  const [url, setUrl] = useState("");
  const [allowHttp, setAllowHttp] = useState(false);
  const [verification, setVerification] = useState<PlexVerification | null>(
    null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const tokenInput = useRef<HTMLInputElement>(null);
  const errorMessage = useRef<HTMLParagraphElement>(null);
  const alive = useRef(false);
  const pendingPin = useRef<number | null>(null);
  const working = useRef(false);

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

  useEffect(() => {
    let active = true;
    alive.current = true;
    void providers
      .state()
      .then((value) => {
        if (active) setState(value);
      })
      .catch((e: unknown) => {
        if (active) setError(providerMessage(e));
      });
    return () => {
      active = false;
      alive.current = false;
      if (pendingPin.current !== null)
        void providers.cancelAuth(pendingPin.current).catch(() => {});
    };
  }, []);

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
        setError(providerMessage(e));
        try {
          const latest = await providers.state();
          if (alive.current) setState(latest);
        } catch {
          /* Keep the actionable original error. */
        }
      }
    } finally {
      working.current = false;
      if (alive.current) setBusy(null);
    }
  }
  async function update(action: () => Promise<PlexState>) {
    const result = await action();
    if (alive.current) {
      setState(result);
      setVerification(null);
      setLibrary(result.selection?.library?.id ?? "");
    }
  }
  async function signIn() {
    const pin = await providers.beginAuth();
    if (!alive.current) {
      await providers.cancelAuth(pin.id);
      return;
    }
    pendingPin.current = pin.id;
    setAuth(pin);
    await providers.openAuth(pin.id);
  }
  useEffect(() => {
    if (!auth) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (stopped) return;
      setChecking(true);
      try {
        const result = await providers.pollAuth(auth!.id);
        if (stopped) return;
        setChecking(false);
        setError(null);
        setState(result.state);
        if (result.complete) {
          pendingPin.current = null;
          setAuth(null);
          await run("Discovering servers…", () => update(providers.discover));
        } else {
          timer = setTimeout(() => void poll(), 2000);
        }
      } catch (e) {
        if (!stopped) {
          setError(providerMessage(e));
          const code = e && typeof e === "object" && "code" in e ? e.code : "";
          if (code === "sign_in_expired" || code === "sign_in_cancelled") {
            pendingPin.current = null;
            setAuth(null);
          }
        }
      } finally {
        if (!stopped) setChecking(false);
      }
    }
    timer = setTimeout(() => void poll(), 2000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
    // Only the current PIN/retry controls the polling lifetime.
  }, [auth, checkAgain]);

  const disabled = !!busy || !!auth || checking;
  const selected = state?.selection;
  return (
    <div className="provider-page">
      <Heading overline="MUSIC SOURCE" title="Plex.">
        Connect a Plex music library. Your local music and player stay
        available.
      </Heading>
      <section
        className="provider-section"
        aria-labelledby="plex-status-heading"
      >
        <div className="provider-status-row">
          <Server size={24} aria-hidden="true" />
          <div>
            <h2 id="plex-status-heading" className="section-title">
              Connection
            </h2>
            <p role="status">
              {state
                ? statusLabels[state.status]
                : error
                  ? "Connection unavailable"
                  : "Loading Plex connection…"}
            </p>
          </div>
        </div>
        {selected && (
          <dl className="provider-details">
            <div>
              <dt>Server</dt>
              <dd>{selected.serverName}</dd>
            </div>
            <div>
              <dt>Address</dt>
              <dd>{selected.url}</dd>
            </div>
            <div>
              <dt>Music library</dt>
              <dd>{selected.library?.title ?? "Choose a library below"}</dd>
            </div>
          </dl>
        )}
        <div className="actions">
          {selected && (
            <>
              <button
                className="secondary"
                disabled={disabled}
                onClick={() =>
                  void run("Testing connection…", async () => {
                    await update(providers.test);
                    if (alive.current) setNotice("Connection test passed.");
                  })
                }
              >
                Test connection
              </button>
              <button
                className="secondary"
                disabled={disabled}
                onClick={() =>
                  void run("Reconnecting…", () => update(providers.reconnect))
                }
              >
                <RefreshCw size={16} />
                Reconnect
              </button>
            </>
          )}
          {(selected || state?.accountConnected) && (
            <button
              className="secondary"
              disabled={disabled}
              onClick={() =>
                void run("Disconnecting…", async () => {
                  await update(providers.disconnect);
                  if (alive.current) {
                    setServer("");
                    setLibrary("");
                    setNotice(
                      "Plex disconnected. Saved Plex credentials were removed from this device.",
                    );
                  }
                })
              }
            >
              <Unplug size={16} />
              Disconnect Plex
            </button>
          )}
          {!state && !busy && (
            <button
              className="secondary"
              onClick={() =>
                void run("Loading connection…", () => update(providers.state))
              }
            >
              Retry connection settings
            </button>
          )}
        </div>
        {busy && (
          <p role="status" className="sub">
            {busy}
          </p>
        )}
        {error && (
          <p
            ref={errorMessage}
            id="plex-error"
            role="alert"
            tabIndex={-1}
            className="warning"
          >
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="sub">
            {notice}
          </p>
        )}
      </section>

      <section
        className="provider-section"
        aria-labelledby="plex-account-heading"
      >
        <h2 id="plex-account-heading" className="section-title">
          Plex account
        </h2>
        <p className="sub">
          Sign in through your browser. Muse stores credentials in your system
          credential store.
        </p>
        <div className="actions">
          <button
            className="primary"
            disabled={disabled || !state}
            onClick={() => void run("Starting sign-in…", signIn)}
          >
            {state?.accountConnected
              ? "Sign in to another account"
              : "Sign in with Plex"}
          </button>
          {state?.accountConnected && (
            <button
              className="secondary"
              disabled={disabled}
              onClick={() =>
                void run("Discovering servers…", () =>
                  update(providers.discover),
                )
              }
            >
              Discover servers
            </button>
          )}
        </div>
        {auth && (
          <div className="provider-sign-in">
            <p role="status" className="sub">
              {checking
                ? "Checking Plex sign-in…"
                : "Complete sign-in in your browser, then return to Muse."}
            </p>
            <div className="actions">
              <button
                className="secondary"
                disabled={checking || !!busy}
                onClick={() =>
                  void run("Opening Plex…", () => providers.openAuth(auth.id))
                }
              >
                <ExternalLink size={16} />
                Open Plex sign-in
              </button>
              <button
                className="secondary"
                disabled={checking || !!busy}
                onClick={() => {
                  setError(null);
                  setCheckAgain((n) => n + 1);
                }}
              >
                Check sign-in
              </button>
              <button
                className="secondary"
                disabled={checking || !!busy}
                onClick={() =>
                  void run("Cancelling sign-in…", async () => {
                    await providers.cancelAuth(auth.id);
                    pendingPin.current = null;
                    if (alive.current) setAuth(null);
                  })
                }
              >
                Cancel sign-in
              </button>
            </div>
          </div>
        )}
        {!!state?.servers.length && (
          <form
            className="provider-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run("Connecting to server…", () =>
                update(() => providers.selectServer(server, allowHttp)),
              );
            }}
          >
            <label htmlFor="plex-server">Server</label>
            <select
              id="plex-server"
              value={server}
              onChange={(e) => setServer(e.target.value)}
              disabled={disabled}
              required
            >
              <option value="">Choose a Plex server</option>
              {state.servers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <button className="secondary" disabled={disabled || !server}>
              Connect server
            </button>
          </form>
        )}
        {state?.accountConnected && !state.servers.length && !busy && (
          <p className="sub">
            Use Discover servers to refresh your account. If no servers appear,
            check server sharing and remote access in Plex.
          </p>
        )}
      </section>

      <section
        className="provider-section"
        aria-labelledby="plex-library-heading"
      >
        <h2 id="plex-library-heading" className="section-title">
          Music library
        </h2>
        {state?.libraries.length ? (
          <form
            className="provider-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run("Selecting library…", () =>
                update(() => providers.selectLibrary(library)),
              );
            }}
          >
            <label htmlFor="plex-library">Library</label>
            <select
              id="plex-library"
              value={library || selected?.library?.id || ""}
              onChange={(e) => setLibrary(e.target.value)}
              disabled={disabled}
              required
            >
              <option value="">Choose a music library</option>
              {state.libraries.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
            <button
              className="secondary"
              disabled={disabled || !(library || selected?.library?.id)}
            >
              Use music library
            </button>
          </form>
        ) : (
          <p className="sub">
            {selected
              ? "Reconnect to refresh music libraries. Only music libraries are listed."
              : "Connect a server to find your music libraries."}
          </p>
        )}
        {selected?.library && (
          <button
            className="secondary"
            disabled={disabled}
            onClick={() =>
              void run("Checking metadata…", async () => {
                const result = await providers.verifyMetadata();
                if (alive.current) setVerification(result);
              })
            }
          >
            Verify library metadata
          </button>
        )}
        {verification && (
          <div className="provider-verification" role="status">
            <p>Metadata check passed.</p>
            <p className="sub">
              {verification.artists.total.toLocaleString()} artists ·{" "}
              {verification.albums.total.toLocaleString()} albums ·{" "}
              {verification.tracks.total.toLocaleString()} tracks
            </p>
            <p className="sub">
              Muse verified a small metadata sample. Plex browsing and playback
              are coming in a later phase.
            </p>
          </div>
        )}
      </section>

      <section
        className="provider-section"
        aria-labelledby="plex-manual-heading"
      >
        <h2 id="plex-manual-heading" className="section-title">
          Manual connection
        </h2>
        <p className="sub">
          For development, connect with your server URL and a Plex token. The
          token is cleared from this form after each attempt.
        </p>
        <form
          className="provider-form plex-manual"
          onSubmit={(e) => {
            e.preventDefault();
            if (!tokenInput.current || disabled) return;
            const token = tokenInput.current.value;
            tokenInput.current.value = "";
            void run("Connecting to Plex…", () =>
              update(() => providers.manual(url, token, allowHttp)),
            );
          }}
        >
          <label htmlFor="plex-url">Server URL</label>
          <input
            id="plex-url"
            type="url"
            placeholder="https://plex.example.com:32400"
            value={url}
            maxLength={2048}
            onChange={(e) => setUrl(e.target.value)}
            disabled={disabled}
            required
            autoComplete="off"
            spellCheck={false}
          />
          <label htmlFor="plex-token">Plex token</label>
          <input
            id="plex-token"
            ref={tokenInput}
            type="password"
            maxLength={4096}
            disabled={disabled}
            required
            autoComplete="off"
            spellCheck={false}
          />
          <button className="secondary" disabled={disabled || !state}>
            Connect manually
          </button>
        </form>
        <label className="provider-http-option">
          <input
            type="checkbox"
            checked={allowHttp}
            disabled={disabled}
            onChange={(e) => setAllowHttp(e.target.checked)}
          />
          Allow HTTP for a local development server
        </label>
        <p className="sub">
          HTTPS is used by default. Local HTTP sends the token without
          encryption on your local network.
        </p>
      </section>
      <button
        className="secondary"
        onClick={() => useMuse.getState().navigate("library")}
      >
        Return to local music
      </button>
    </div>
  );
}
