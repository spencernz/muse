import { installScrollbarActivity } from '../scrollbar-activity';
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  CircleDot,
  FolderPlus,
  Home,
  Library,
  LoaderCircle,
  Minimize2,
  ListMusic,
  Music2,
  Search,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { useMuse } from "../store";
import { HomeScreen } from "./home";
import { AlbumScreen, LibraryScreen, SongsScreen } from "./library";
import { MiniPlayer, NowPlayingScreen } from "./player";
import { usePlayerShortcuts } from "../playback-shortcuts";
import { PlaylistScreen, PlaylistsScreen } from "./playlists";
import { SftpScreen } from "./sftp";
import { PlexScreen } from "./plex";
import { SettingsScreen } from "./settings";
import type { Page } from "../types";
import { api, artwork, native } from "../native";
import { useAlbumAtmosphere } from "../use-album-atmosphere";
import { useAlbumNavigation } from "../use-album-navigation";
import { AiPlaylistDialog } from "./ai-playlist";

export function App() {
  useEffect(()=>installScrollbarActivity(),[]);
  const [fullscreen,setFullscreen]=useState(false);
  useEffect(()=>{
    if(!native)return;
    let active=true, receivedEvent=false;
    const stop=listen<boolean>("native-fullscreen-changed",event=>{receivedEvent=true;if(active)setFullscreen(event.payload);});
    void api.windowFullscreen().then(value=>{if(active && !receivedEvent)setFullscreen(value);}).catch(useMuse.getState().fail);
    void stop.catch(useMuse.getState().fail);
    return ()=>{active=false;void stop.then(unlisten=>unlisten()).catch(()=>{});};
  },[]);
  const [creatingMix, setCreatingMix] = useState(false);
  const playlists = useMuse((s) => s.library.playlists);
  const macWindow = native && /Mac/.test(navigator.userAgent);
  const cover = useMuse(
    (s) =>
      s.playback.current?.cover ??
      s.library.albums.find((album) => album.id === s.playback.current?.albumId)
        ?.cover,
  );
  const theme = useAlbumAtmosphere(artwork(cover));
  const albumCover = useMuse((s) =>
    s.page === "album"
      ? s.library.albums.find((album) => album.id === s.context)?.cover
      : undefined,
  );
  const albumSource = artwork(albumCover);
  const albumTheme = useAlbumAtmosphere(albumSource);
  const albumStyle = Object.fromEntries(
    Object.entries(albumTheme).map(([key, value]) => [
      `--album-${key === "onAccent" ? "on-accent" : key}`,
      value,
    ]),
  ) as CSSProperties;
  const themeStyle = {
    "--muse-accent": theme.accent,
    "--muse-on-accent": theme.onAccent,
    "--now-accent": theme.accent,
    "--now-on-accent": theme.onAccent,
    "--now-background": theme.background,
    "--now-surface": theme.surface,
    "--now-muted": theme.muted,
  } as CSSProperties;
  const page = useMuse((s) => s.page),
    context = useMuse((s) => s.context),
    navigate = useMuse((s) => s.navigate),
    search = useMuse((s) => s.search),
    setSearch = useMuse((s) => s.setSearch);
  const loading = useMuse((s) => s.loading),
    error = useMuse((s) => s.error),
    notice = useMuse((s) => s.notice),
    importing = useMuse((s) => s.importing),
    scan = useMuse((s) => s.scan);
  const content = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const wasNow = useRef(false);
  function closeNowPlaying() {
    const state = useMuse.getState();
    if (state.navigationHistory.length) state.goBack();
    else state.navigate("home");
  }
  useEffect(() => {
    if (page === "now" && useMuse.getState().context !== "queue")
      closeButton.current?.focus({ preventScroll: true });
    else if (wasNow.current)
      document
        .querySelector<HTMLButtonElement>(
          '.thumb[aria-label="Open Now Playing"]',
        )
        ?.focus({ preventScroll: true });
    wasNow.current = page === "now";
    if (page !== "now") return;
    function dismiss(event: KeyboardEvent) {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        document.querySelector("dialog[open]")
      )
        return;
      event.preventDefault();
      closeNowPlaying();
    }
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [page]);
  const canGoBack = useMuse((s) => s.navigationHistory.length > 0);
  const albumNavigation = useAlbumNavigation(content);
  usePlayerShortcuts();
  const navs: [Page, string, typeof Home][] = [
    ["home", "Home", Home],
    ["library", "Library", Library],
    ["songs", "Songs", Music2],
    ["playlists", "Playlists", ListMusic],
    ["now", "Now Playing", CircleDot],
  ];
  const label =
    navs.find((n) => n[0] === page)?.[1] ??
    {
      album: "Album",
      artist: "Artist",
      genre: "Genre",
      favourites: "Favourites",
      playlist: "Playlist",
      settings: "Settings",
      sftp: "Settings / SSH / SFTP",
      plex: "Plex",
    }[page as "album"];
  const fullscreenExit = fullscreen ? <button className="iconbtn native-fullscreen-exit" aria-label="Exit fullscreen" title="Exit fullscreen" onClick={()=>void api.exitFullscreen().catch(useMuse.getState().fail)}><Minimize2 size={24}/></button> : null;
  return (
    <div
      className={`app ${page === "now" ? "app--now" : ""} ${macWindow ? "app--mac" : ""}`}
      style={themeStyle}
    >
      {macWindow && (
        <div
          className="window-drag-region"
          data-tauri-drag-region
          aria-hidden="true"
        />
      )}
      <div className="workspace">
        {page !== "now" && (
          <aside className="sidebar">
            <div className="brand">
              muse<span>.</span>
            </div>
            <nav className="nav" aria-label="Main navigation">
              {navs.map(([value, label, Icon]) => (
                <button
                  key={value}
                  className={
                    page === value ||
                    (value === "library" &&
                      ["album", "artist", "genre"].includes(page))
                      ? "active"
                      : ""
                  }
                  onClick={() => navigate(value)}
                  aria-label={label}
                  aria-current={page === value ? "page" : undefined}
                >
                  <Icon />
                  <span>{label}</span>
                </button>
              ))}
            </nav>
            <div className="sidebar-playlists">
              <nav className="nav" aria-label="Your playlists">
                <button onClick={() => setCreatingMix(true)} aria-label="Create AI playlist" title="Create AI playlist">
                  <Sparkles /><span>Create AI playlist</span>
                </button>
                {playlists.map((playlist) => <button key={playlist.id}
                  className={page === "playlist" && context === playlist.id ? "active" : ""}
                  aria-current={page === "playlist" && context === playlist.id ? "page" : undefined}
                  aria-label={`Playlist: ${playlist.name}`} title={playlist.name}
                  onClick={() => navigate("playlist", playlist.id)}>
                  <ListMusic /><span>{playlist.name}</span>
                </button>)}
              </nav>
            </div>
            <button
              className={`settings-button ${["settings", "sftp", "plex"].includes(page) ? "active" : ""}`}
              onClick={() => navigate("settings")}
              aria-label="Settings"
            >
              <Settings size={17} />
              <span>Settings</span>
            </button>
          </aside>
        )}
        <div
          className={`main-area ${page === "album" ? "main-area--album" : ""}`}
          style={page === "album" ? albumStyle : undefined}
        >
          {page === "now" && (
            <div className="window-actions" role="group" aria-label="Window controls">
            {fullscreenExit}
            <button
              ref={closeButton}
              className="iconbtn now-close"
              aria-label="Close Now Playing"
              title="Close Now Playing (Esc)"
              onClick={closeNowPlaying}
            >
              <X size={24} />
            </button>
            </div>
          )}
          {page === "album" && (
            <div className="album-panel-background" aria-hidden="true">
              {albumSource && (
                <img
                  key={albumSource}
                  className="album-panel-art"
                  src={albumSource}
                  alt=""
                  onError={(event) => {
                    event.currentTarget.style.visibility = "hidden";
                  }}
                />
              )}
              <div className="album-panel-overlay" />
            </div>
          )}
          <main
            className={`content ${page === "album" ? "album-content" : page === "now" ? "now-content" : ""}`}
            ref={content}
            id="main-content"
            tabIndex={-1}
            style={page === "album" ? albumStyle : undefined}
            onClickCapture={albumNavigation.onAlbumClick}
          >
            <a className="skip-link" href="#main-content">
              Skip to music
            </a>
            {page !== "now" && (
              <nav
                className="content-navigation"
                aria-label="Content navigation"
              >
                {page !== "home" && <button
                  className="iconbtn content-back"
                  aria-label="Go back"
                  disabled={!canGoBack}
                  onClick={albumNavigation.back}
                >
                  <ArrowLeft size={24} />
                </button>}
                <span className="breadcrumb">
                  {page === "album"
                    ? "Library / Albums"
                    : page === "artist"
                      ? "Library / Artists"
                      : page === "genre"
                        ? "Library / Genres"
                        : page === "playlist"
                          ? "Playlists / Playlist"
                          : label}
                </span>
                <div className="tools">
                  <div className="search-field">
                    <Search
                      className="search-icon"
                      size={16}
                      aria-hidden="true"
                    />
                    <input
                      className="search"
                      type="search"
                      placeholder="Search music..."
                      aria-label="Search music"
                      value={search}
                      maxLength={300}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <button
                    className="topbtn"
                    disabled={importing}
                    onClick={() => void useMuse.getState().importFolders()}
                  >
                    <FolderPlus size={14} />
                    <span>
                      {importing ? "Choosing folders…" : "Import music"}
                    </span>
                  </button>
                  {fullscreenExit}
                </div>
              </nav>
            )}
            {scan.running && (
              <div className="scan-status" role="status">
                <LoaderCircle className="spin" size={13} />
                <span>
                  Indexing · {scan.scanned.toLocaleString()} checked
                  {scan.current ? ` · ${scan.current}` : ""}
                </span>
                <button onClick={() => navigate("settings")}>
                  View folders
                </button>
              </div>
            )}
            {(error || notice) && (
              <div
                className={`notice ${error ? "notice-error" : ""}`}
                role={error ? "alert" : "status"}
              >
                <span>{error ?? notice}</span>
                <button
                  className="iconbtn"
                  aria-label="Dismiss message"
                  onClick={() => useMuse.getState().clearError()}
                >
                  <X size={15} />
                </button>
              </div>
            )}
            {loading ? (
              <div className="empty" role="status">
                <LoaderCircle size={22} className="spin" />
                <p>Opening your music library…</p>
              </div>
            ) : page === "home" ? (
              <HomeScreen />
            ) : page === "library" ? (
              <LibraryScreen />
            ) : page === "album" ? (
              <AlbumScreen key={context} />
            ) : page === "now" ? (
              <NowPlayingScreen />
            ) : page === "playlists" ? (
              <PlaylistsScreen />
            ) : page === "playlist" ? (
              <PlaylistScreen />
            ) : page === "sftp" ? (
              <SftpScreen />
            ) : page === "plex" ? (
              <PlexScreen />
            ) : page === "settings" ? (
              <SettingsScreen />
            ) : (
              <SongsScreen key={`${page}:${context}`} />
            )}
          </main>
        </div>
      </div>
      {page !== "now" && <MiniPlayer />}
      {creatingMix && <AiPlaylistDialog onClose={() => setCreatingMix(false)} />}
    </div>
  );
}
