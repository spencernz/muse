import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Clock3,
  Heart,
  Library,
  Music2,
  Pin,
  Shuffle,
  SlidersHorizontal,
  Trash2,
  ListMusic,
} from "lucide-react";
import { AiDjSuggestions } from "./ai-playlist";
import { useMuse } from "../store";
import type { Tile, TileSize } from "../types";
import { AlbumCard, Cover, Heading } from "./shared";

export function HomeScreen() {
  const library = useMuse((s) => s.library),
    saveTiles = useMuse((s) => s.saveTiles),
    navigate = useMuse((s) => s.navigate);
  const [editing, setEditing] = useState(false),
    [drag, setDrag] = useState<string | null>(null);
  const tiles = library.tiles;
  const recent = [...library.albums].sort(
    (a, b) => b.lastPlayed - a.lastPlayed || b.addedAt - a.addedAt,
  );
  const hour = new Date().getHours(),
    greeting =
      hour < 12
        ? "Good morning."
        : hour < 18
          ? "Good afternoon."
          : "Good evening.";
  function move(from: number, to: number) {
    if (to < 0 || to >= tiles.length) return;
    const next = [...tiles];
    const [tile] = next.splice(from, 1);
    next.splice(to, 0, tile);
    void saveTiles(next);
  }
  function resize(id: string, size: TileSize) {
    void saveTiles(tiles.map((t) => (t.id === id ? { ...t, size } : t)));
  }
  function activate(tile: Tile, index: number) {
    if (tile.kind === "recent" || tile.kind === "album") {
      const album = tile.target
        ? library.albums.find((a) => a.id === tile.target)
        : (recent[tile.kind === "recent" ? 0 : index === 2 ? 1 : 2] ??
          recent[0]);
      if (album) navigate("album", album.id);
      else void useMuse.getState().importFolders();
    } else if (tile.kind === "artist" && tile.target)
      navigate("artist", tile.target);
    else if (tile.kind === "favourites") navigate("favourites");
    else if (tile.kind === "shuffle")
      void useMuse
        .getState()
        .control({ action: "play", query: {}, mode: "shuffle" });
    else if (tile.kind === "playlists") navigate("playlists");
    else if (tile.kind === "added") navigate("songs", "recently-added");
    else navigate("library");
  }
  return (
    <>
      <Heading
        overline="YOUR PERSONAL MUSIC SPACE"
        title={greeting}
        actions={
          <button
            className={`secondary ${editing ? "active" : ""}`}
            onClick={() => setEditing(!editing)}
          >
            <SlidersHorizontal size={14} />
            {editing ? "Done editing" : "Edit tiles"}
          </button>
        }
      >
        Everything you love, all in one place.
      </Heading>
      {editing && (
        <div className="tile-editor notice">
          <p>
            Drag tiles to rearrange, or use the arrow buttons. Pin albums and
            artists from their library pages.
          </p>
          <div className="actions compact">
            {(
              [
                "favourites",
                "shuffle",
                "playlists",
                "added",
                "collection",
                "recent",
              ] as const
            ).map((kind) => (
              <button
                className="secondary"
                key={kind}
                onClick={() =>
                  void saveTiles([
                    ...tiles,
                    {
                      id: crypto.randomUUID(),
                      kind,
                      size: kind === "collection" ? "wide" : "small",
                      target: null,
                    },
                  ])
                }
              >
                + {kind === "added" ? "recently added" : kind}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="tile-layout">
        <div className="tiles">
          {tiles.map((tile, index) => {
            const album = tile.target
              ? library.albums.find((a) => a.id === tile.target)
              : (recent[tile.kind === "recent" ? 0 : index === 2 ? 1 : 2] ??
                recent[0]);
            const isArt = tile.kind === "album" || tile.kind === "recent",
              artist =
                tile.kind === "artist"
                  ? library.artists.find((a) => a.name === tile.target)
                  : null;
            const labels = {
              favourites: "favourites",
              shuffle: "shuffle all",
              playlists: "playlists",
              added: "recently added",
              collection: "your collection",
              artist: tile.target ?? "artist",
              album: album?.title ?? "import your music",
              recent: album?.title ?? "Your music starts here.",
            };
            const Icon =
              tile.kind === "favourites"
                ? Heart
                : tile.kind === "shuffle"
                  ? Shuffle
                  : tile.kind === "playlists"
                    ? ListMusic
                    : tile.kind === "added"
                      ? Clock3
                      : tile.kind === "artist"
                        ? Music2
                        : Library;
            const color =
              tile.kind === "favourites"
                ? "purple"
                : tile.kind === "shuffle"
                  ? "teal"
                  : tile.kind === "playlists"
                    ? "rose"
                    : tile.kind === "added"
                      ? "amber"
                      : tile.kind === "artist"
                        ? "blue"
                        : "lilac";
            return (
              <article
                className={`tile-cell ${tile.size} ${editing ? "editing" : ""}`}
                key={tile.id}
                draggable={editing}
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/plain", tile.id);
                  event.dataTransfer.effectAllowed = "move";
                  setDrag(tile.id);
                }}
                onDragOver={(e) => editing && e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = tiles.findIndex(
                    (t) =>
                      t.id === (e.dataTransfer.getData("text/plain") || drag),
                  );
                  if (from >= 0) move(from, index);
                  setDrag(null);
                }}
              >
                <button
                  className={`tile ${isArt ? "art" : color}`}
                  onClick={() => !editing && activate(tile, index)}
                  aria-label={labels[tile.kind]}
                >
                  {isArt ? (
                    <>
                      <Cover
                        key={album?.cover ?? album?.id}
                        path={album?.cover}
                        remote={album?.id.startsWith("sftp:")}
                        title={album?.title ?? "Your music starts here."}
                        artist={album?.artist ?? "Import a folder to begin"}
                      />
                      <div className="tile-caption">
                        {album
                          ? `${album.title} · ${album.artist}`
                          : "Import your music"}
                        {tile.kind === "recent" && album && (
                          <small>
                            {album.lastPlayed
                              ? "Recently played"
                              : "Recently added"}
                          </small>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="symbol">
                        <Icon />
                      </span>
                      <span
                        className={`tile-label ${tile.kind === "collection" ? "collection-label" : ""}`}
                      >
                        {labels[tile.kind]}
                        {tile.kind === "collection" && (
                          <small>Albums · Artists · Songs</small>
                        )}
                        {artist && <small>{artist.tracks} tracks</small>}
                      </span>
                    </>
                  )}
                </button>
                {editing && (
                  <div className="tile-edit-controls">
                    <label className="sr-only" htmlFor={`size-${tile.id}`}>
                      Size of {labels[tile.kind]}
                    </label>
                    <select
                      id={`size-${tile.id}`}
                      value={tile.size}
                      onChange={(e) =>
                        resize(tile.id, e.target.value as TileSize)
                      }
                    >
                      <option value="small">Small · 1×1</option>
                      <option value="wide">Wide · 2×1</option>
                      <option value="medium">Medium · 2×2</option>
                    </select>
                    <div>
                      <button
                        className="iconbtn"
                        aria-label={`Move ${labels[tile.kind]} earlier`}
                        disabled={!index}
                        onClick={() => move(index, index - 1)}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        className="iconbtn"
                        aria-label={`Move ${labels[tile.kind]} later`}
                        disabled={index === tiles.length - 1}
                        onClick={() => move(index, index + 1)}
                      >
                        <ArrowDown size={15} />
                      </button>
                      <button
                        className="iconbtn"
                        aria-label={`Unpin ${labels[tile.kind]}`}
                        onClick={() =>
                          void saveTiles(tiles.filter((t) => t.id !== tile.id))
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
      <AiDjSuggestions />
      <h2 className="section-title">Made for your library</h2>
      {library.albums.length ? (
        <div className="albums">
          {recent.slice(0, 10).map((album) => (
            <AlbumCard album={album} key={album.id} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <Music2 size={24} />
          <p>Your albums, artwork and favourites will appear here.</p>
          <button
            className="primary"
            onClick={() => void useMuse.getState().importFolders()}
          >
            Import your first folder
          </button>
        </div>
      )}
      {library.albums.some((a) => tiles.some((t) => t.target === a.id)) && (
        <p className="sub pinned-note">
          <Pin size={12} />
          Your pinned collection is saved on this device.
        </p>
      )}
    </>
  );
}
