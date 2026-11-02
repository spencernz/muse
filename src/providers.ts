import { invoke } from "@tauri-apps/api/core";
import type { Album, Facet, Track } from "./types";

export interface MusicProviderDescriptor {
  id: string;
  name: string;
  metadata: boolean;
  playback: boolean;
}
export interface ProviderLibrary {
  id: string;
  title: string;
}
export interface PlexServer {
  id: string;
  name: string;
  connections: number;
}
export interface PlexSelection {
  serverId: string;
  serverName: string;
  url: string;
  allowLocalHttp: boolean;
  library: ProviderLibrary | null;
  account: boolean;
}
export interface PlexState {
  accountConnected: boolean;
  status:
    "disconnected" | "configured" | "choose_library" | "connected" | "error";
  selection: PlexSelection | null;
  servers: PlexServer[];
  libraries: ProviderLibrary[];
}
export interface PlexAuth {
  id: number;
  url: string;
  expiresAt: number;
}
export type ProviderArtwork =
  | { provider: "local"; path: string }
  | { provider: "plex"; serverId: string; key: string };
export type ProviderMetadata =
  | {
      kind: "artist";
      id: string;
      artist: Facet;
      artwork: ProviderArtwork | null;
    }
  | { kind: "album"; album: Album; artwork: ProviderArtwork | null }
  | { kind: "track"; track: Track; artwork: ProviderArtwork | null };
export interface ProviderPage {
  providerId: string;
  offset: number;
  total: number;
  items: ProviderMetadata[];
}
export interface PlexVerification {
  artists: ProviderPage;
  albums: ProviderPage;
  tracks: ProviderPage;
}

// Tokens are never returned by these commands. Manual input crosses IPC once, directly into native storage.
export const providers = {
  list: () => invoke<MusicProviderDescriptor[]>("music_providers"),
  state: () => invoke<PlexState>("plex_state"),
  beginAuth: () => invoke<PlexAuth>("plex_begin_auth"),
  openAuth: (id: number) => invoke<void>("plex_open_auth", { id }),
  pollAuth: (id: number) =>
    invoke<{ complete: boolean; state: PlexState }>("plex_poll_auth", { id }),
  cancelAuth: (id: number) => invoke<void>("plex_cancel_auth", { id }),
  discover: () => invoke<PlexState>("plex_discover"),
  selectServer: (id: string, allowLocalHttp: boolean) =>
    invoke<PlexState>("plex_select_server", { id, allowLocalHttp }),
  manual: (url: string, token: string, allowLocalHttp: boolean) =>
    invoke<PlexState>("plex_manual", { url, token, allowLocalHttp }),
  selectLibrary: (id: string) =>
    invoke<PlexState>("plex_select_library", { id }),
  test: () => invoke<PlexState>("plex_test"),
  reconnect: () => invoke<PlexState>("plex_reconnect"),
  verifyMetadata: () => invoke<PlexVerification>("plex_verify_metadata"),
  disconnect: () => invoke<PlexState>("plex_disconnect"),
};

// Do not echo arbitrary native/network exceptions (which might contain sensitive request data).
export function providerMessage(value: unknown): string {
  const code =
    value && typeof value === "object" && "code" in value
      ? String(value.code)
      : "";
  const messages: Record<string, string> = {
    invalid_server:
      "Enter a server URL without a path, query, or embedded credentials.",
    insecure_connection:
      "Use HTTPS, or allow HTTP for a local development server.",
    unsafe_address:
      "This server address or redirect is not allowed. Check the Plex server URL.",
    unreachable:
      "Could not reach Plex. Check the server, network, and TLS certificate, then retry.",
    unauthorized:
      "Plex rejected the credentials. Sign in again or replace the manual token.",
    invalid_response:
      "Plex returned an unexpected response. Check the server address and try again.",
    response_too_large:
      "Plex returned too much data. Try the connection again.",
    credential_store:
      "Unlock your system credential store and retry. Muse will not save credentials as plaintext.",
    not_connected: "Connect Plex and select a music library first.",
    sign_in_expired: "Plex sign-in expired. Start signing in again.",
    sign_in_cancelled:
      "This sign-in is no longer active. Start signing in again.",
    busy: "A Plex operation is already running. Wait for it to finish and retry.",
    library_unavailable:
      "This music library is no longer available. Reconnect and choose a library again.",
    storage:
      "Could not save your Plex selection. Check the app data folder and retry.",
    browser: "Could not open the browser. Use Open Plex sign-in to retry.",
  };
  return (
    messages[code] ??
    "Could not complete the Plex request. Retry the connection."
  );
}
