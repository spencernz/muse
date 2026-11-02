export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  albumId: string;
  year: number | null;
  genre: string;
  duration: number;
  trackNo: number;
  discNo: number;
  cover: string | null;
  liked: boolean;
  available: boolean;
  addedAt: number;
}
export interface Album {
  id: string;
  title: string;
  artist: string;
  year: number | null;
  genre: string;
  cover: string | null;
  duration: number;
  tracks: number;
  addedAt: number;
  lastPlayed: number;
}
export interface SourceFolder {
  id: string;
  path: string;
  available: boolean;
  lastScan: number;
  error: string | null;
}
export interface Playlist {
  id: string;
  name: string;
  tracks: number;
}
export interface Facet {
  name: string;
  tracks: number;
  cover: string | null;
}
export type TileSize = "small" | "medium" | "wide";
export interface Tile {
  id: string;
  kind:
    | "recent"
    | "album"
    | "artist"
    | "favourites"
    | "shuffle"
    | "playlists"
    | "added"
    | "collection";
  size: TileSize;
  target: string | null;
}
export interface Library {
  tracks: number;
  albums: Album[];
  artists: Facet[];
  genres: Facet[];
  sources: SourceFolder[];
  playlists: Playlist[];
  tiles: Tile[];
  issues: { path: string; error: string }[];
}
export interface TrackQuery {
  search?: string;
  albumId?: string;
  artist?: string;
  genre?: string;
  playlistId?: string;
  favourites?: boolean;
  sort?: string;
  offset?: number;
  limit?: number;
}
export interface TrackPage {
  items: Track[];
  total: number;
}
export interface Playback {
  current: Track | null;
  playing: boolean;
  position: number;
  volume: number;
  shuffle: boolean;
  repeat: "off" | "all" | "one";
  queue: string[];
  index: number;
  error: string | null;
  mediaControls: boolean;
}
export interface PlayerRequest {
  action: string;
  ids?: string[];
  query?: TrackQuery;
  start?: string;
  index?: number;
  to?: number;
  value?: number;
  mode?: string;
}
export interface ScanProgress {
  running: boolean;
  scanned: number;
  changed: number;
  errors: number;
  current: string;
  message: string;
}
export type Page =
  | "home"
  | "library"
  | "songs"
  | "album"
  | "artist"
  | "genre"
  | "playlists"
  | "playlist"
  | "favourites"
  | "now"
  | "settings"
  | "plex"
  | "sftp";
export const emptyLibrary: Library = {
  tracks: 0,
  albums: [],
  artists: [],
  genres: [],
  sources: [],
  playlists: [],
  tiles: [],
  issues: [],
};
export const emptyPlayback: Playback = {
  current: null,
  playing: false,
  position: 0,
  volume: 0.8,
  shuffle: false,
  repeat: "off",
  queue: [],
  index: 0,
  error: null,
  mediaControls: false,
};
