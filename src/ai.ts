import type {Playback} from "./types";
import { invoke } from "@tauri-apps/api/core";
export interface AiSettings { configured: boolean; model: string }
export interface AiPlaylist { id: string; name: string; tracks: number }
export interface AlbumInfoPreview { id: string; albumId: string; title: string; artist: string; year: number | null; genre: string; cover: string | null; newCover: boolean; source: string; warning: string | null }
export interface AlbumInfoEdits { title: string; artist: string; year: number | null; genre: string; applyCover: boolean }
export const ai = {
  startDj:(mood:string)=>invoke<{playback:Playback;mood:string;tracks:number;duration:number;shorter:boolean}>("start_ai_dj",{mood}),
  settings: () => invoke<AiSettings>("ai_settings"),
  generatePlaylist: (mood: string) => invoke<AiPlaylist>("generate_ai_playlist", { mood }),
  save: (model: string, key: string | null) => invoke<AiSettings>("save_ai_settings", { model, key }),
  removeKey: () => invoke<AiSettings>("remove_ai_key"),
  test: () => invoke<void>("test_ai_connection"),
  searchAlbum: (albumId: string) => invoke<AlbumInfoPreview>("search_album_info", { albumId }),
  applyAlbum: (id: string, edits: AlbumInfoEdits) => invoke<void>("apply_album_info", { id, edits }),
  discard: (id: string) => invoke<void>("discard_album_preview", { id }),
};
export function aiMessage(e: unknown) { return typeof e === "string" ? e : "Could not complete the AI request. Check the connection and try again."; }
