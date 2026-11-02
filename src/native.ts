import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  Library,
  Playback,
  PlayerRequest,
  ScanProgress,
  Tile,
  Track,
  TrackPage,
  TrackQuery,
} from "./types";

export const native = isTauri();
export function artwork(path: string | null | undefined) {
  return path ? convertFileSrc(path) : undefined;
}
export type CloseBehavior = "background" | "quit";
export type AppPreferences = { closeBehavior: CloseBehavior; backgroundAvailable: boolean };

export interface Lyrics { plain: string | null; synced: string | null; instrumental: boolean; source: string }

export const api = {
  visualizerActive: (active: boolean) => invoke<void>("visualizer_active", { active }),
  visualizerFrame: () => invoke<import("./visualizer/types").NativeAudioFrame>("visualizer_frame"),
  windowFullscreen: () => invoke<boolean>("window_fullscreen"),
  enterFullscreen: () => invoke<void>("enter_fullscreen"),
  exitFullscreen: () => invoke<void>("exit_fullscreen"),
  artistAlbumIds: (artist: string) => invoke<string[]>("artist_album_ids", { artist }),
  showMainWindow: () => invoke<void>("show_main_window"),
  hideMiniPlayer: () => invoke<void>("hide_mini_player"),
  playlistCovers: (id: string | null) => invoke<string[]>("playlist_covers", { id }),
  lyrics: (id: string) => invoke<Lyrics | null>("track_lyrics", { id }),
  importLyrics: (id: string, text: string) => invoke<void>("import_track_lyrics", { id, text }),
  preferences: () => invoke<AppPreferences>("preferences"),
  setCloseBehavior: (behavior: CloseBehavior) => invoke<void>("set_close_behavior", { behavior }),
  bootstrap: () =>
    invoke<{ library: Library; playback: Playback; scan: ScanProgress }>(
      "bootstrap",
    ),
  library: () => invoke<Library>("library"),
  tracks: (query: TrackQuery) => invoke<TrackPage>("tracks", { query }),
  getTracks: (ids: string[]) => invoke<Track[]>("get_tracks", { ids }),
  trackIds: (query: TrackQuery) =>
    invoke<string[]>("query_track_ids", { query }),
  favourites: (ids: string[], liked: boolean) =>
    invoke<void>("set_favourites", { ids, liked }),
  player: (request: PlayerRequest) => invoke<Playback>("player", { request }),
  favourite: (id: string, liked: boolean) =>
    invoke<void>("favourite", { id, liked }),
  playlist: (
    action: string,
    id: string | null = null,
    name: string | null = null,
    trackIds: string[] = [],
  ) => invoke<string | null>("playlist", { action, id, name, trackIds }),
  tiles: (tiles: Tile[]) => invoke<void>("save_tiles", { tiles }),
  rescan: () => invoke<void>("rescan"),
  stopScan: () => invoke<void>("stop_scan"),
  removeFolder: (id: string) => invoke<void>("remove_folder", { id }),
  async importFolders() {
    const paths = await open({
      directory: true,
      multiple: true,
      title: "Choose your music folders",
    });
    if (paths)
      await invoke<void>("add_folders", {
        paths: Array.isArray(paths) ? paths : [paths],
      });
    return !!paths;
  },
};
