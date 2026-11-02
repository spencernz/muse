import { useCallback, useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Heart, ListPlus, Plus, Trash2 } from "lucide-react";
import { api } from "../native";
import { useMuse } from "../store";
import type { Track, TrackQuery } from "../types";
import { Dialog, Empty } from "./shared";
import { duration } from "../format";

export function AddToPlaylist({
  ids,
  onClose,
}: {
  ids: string[];
  onClose: () => void;
}) {
  const playlists = useMuse((s) => s.library.playlists);
  const [name, setName] = useState(""),
    [busy, setBusy] = useState(false);
  async function add(id: string) {
    setBusy(true);
    try {
      await api.playlist("add", id, null, ids);
      await useMuse.getState().refresh();
      onClose();
    } catch (e) {
      useMuse.getState().fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const id = await api.playlist("create", null, name.trim());
      if (id) await api.playlist("add", id, null, ids);
      await useMuse.getState().refresh();
      onClose();
    } catch (e) {
      useMuse.getState().fail(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="Add to playlist" onClose={onClose}>
      <p className="sub">{ids.length.toLocaleString()} selected tracks</p>
      <div className="playlist-picker">
        {playlists.map((p) => (
          <button
            key={p.id}
            className="secondary"
            disabled={busy}
            onClick={() => void add(p.id)}
          >
            {p.name}
            <span className="muted">{p.tracks} tracks</span>
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
        className="dialog-form"
      >
        <label htmlFor="new-playlist">Create a new playlist</label>
        <input
          id="new-playlist"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          autoFocus={!playlists.length}
        />
        <button
          className="primary"
          disabled={busy || !name.trim()}
          type="submit"
        >
          Create and add tracks
        </button>
      </form>
    </Dialog>
  );
}

export function TrackList({
  query,
  caption = "Tracks",
}: {
  query: TrackQuery;
  caption?: string;
}) {
  const revision = useMuse((s) => s.revision),
    current = useMuse((s) => s.playback.current?.id);
  const parent = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<Map<number, Track[]>>(new Map()),
    [total, setTotal] = useState(0),
    [initial, setInitial] = useState(true),
    [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set()),
    [playlistIds, setPlaylistIds] = useState<string[] | null>(null);
  const requests = useRef(new Set<number>()),
    generation = useRef(0);
  const key = JSON.stringify(query);
  const queryRef = useRef(query);
  queryRef.current = query;
  const fetchPage = useCallback(async (page: number, gen: number) => {
    if (requests.current.has(page)) return;
    requests.current.add(page);
    try {
      const data = await api.tracks({
        ...queryRef.current,
        offset: page * 200,
        limit: 200,
      });
      if (gen !== generation.current) return;
      setPages((old) => new Map(old).set(page, data.items));
      setTotal(data.total);
      setError(null);
    } catch (e) {
      if (gen === generation.current) setError(String(e));
    } finally {
      if (gen === generation.current) {
        requests.current.delete(page);
        setInitial(false);
      }
    }
  }, []);
  useEffect(() => {
    generation.current++;
    requests.current.clear();
    setPages(new Map());
    setInitial(true);
    setError(null);
    void fetchPage(0, generation.current);
  }, [key, revision, fetchPage]);
  useEffect(() => {
    setSelected(new Set());
    if (parent.current) parent.current.scrollTop = 0;
  }, [key]);
  const virtual = useVirtualizer({
    count: total,
    getScrollElement: () => parent.current,
    estimateSize: () => 48,
    overscan: 10,
  });
  const items = virtual.getVirtualItems();
  const from = items[0]?.index ?? 0,
    to = items.at(-1)?.index ?? 0;
  useEffect(() => {
    for (let p = Math.floor(from / 200); p <= Math.floor(to / 200); p++) {
      if (!pages.has(p)) void fetchPage(p, generation.current);
    }
  }, [from, to, pages, fetchPage]);
  const play = (track: Track) =>
    void useMuse
      .getState()
      .control({ action: "play", query: queryRef.current, start: track.id });
  async function favourite(track: Track) {
    try {
      await api.favourite(track.id, !track.liked);
      await useMuse.getState().refresh();
    } catch (e) {
      useMuse.getState().fail(e);
    }
  }
  async function remove() {
    if (!query.playlistId) return;
    try {
      await api.playlist("remove", query.playlistId, null, [...selected]);
      await useMuse.getState().refresh();
    } catch (e) {
      useMuse.getState().fail(e);
    }
  }
  return (
    <section aria-label={caption} className="tracks-section">
      <div className="track-toolbar">
        <span className="muted">
          {initial
            ? "Reading your library…"
            : `${total.toLocaleString()} tracks`}
          {selected.size > 0
            ? ` · ${selected.size.toLocaleString()} selected`
            : ""}
        </span>
        <div className="actions compact">
          <button
            className="secondary"
            disabled={!selected.size}
            onClick={() => setPlaylistIds([...selected])}
          >
            <Plus size={14} /> Add to playlist
          </button>
          <button
            className="secondary"
            disabled={!selected.size}
            onClick={() =>
              void useMuse
                .getState()
                .control({ action: "append", ids: [...selected] })
            }
          >
            <ListPlus size={14} /> Queue
          </button>
          {query.playlistId && (
            <button
              className="secondary"
              disabled={!selected.size}
              onClick={() => void remove()}
            >
              <Trash2 size={14} /> Remove
            </button>
          )}
        </div>
      </div>
      {error ? (
        <Empty title={error}>
          <button
            className="secondary"
            onClick={() => void fetchPage(0, generation.current)}
          >
            Try again
          </button>
        </Empty>
      ) : !initial && !total ? (
        <Empty title="No tracks in this collection yet." />
      ) : (
        <div
          ref={parent}
          className="track-scroll"
          role="table"
          aria-label={caption}
          aria-rowcount={total}
          tabIndex={0}
        >
          <div style={{ height: virtual.getTotalSize(), position: "relative" }}>
            {items.map((item) => {
              const track = pages.get(Math.floor(item.index / 200))?.[
                item.index % 200
              ];
              return (
                <div
                  role="row"
                  aria-rowindex={item.index + 1}
                  key={track?.id ?? item.index}
                  className={`track-row ${current === track?.id ? "playing" : ""} ${track && !track.available ? "unavailable" : ""}`}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: 48,
                    transform: `translateY(${item.start}px)`,
                  }}
                  onDoubleClick={(event) => {
                    if (
                      (event.target as HTMLElement).closest(
                        ".track-selector,.row-actions",
                      )
                    )
                      return;
                    if (track) play(track);
                  }}
                >
                  {track ? (
                    <>
                      <span role="cell" className="track-selector">
                        <input
                          type="checkbox"
                          aria-label={`Select ${track.title}`}
                          checked={selected.has(track.id)}
                          onChange={(e) =>
                            setSelected((old) => {
                              const next = new Set(old);
                              if (e.target.checked) next.add(track.id);
                              else next.delete(track.id);
                              return next;
                            })
                          }
                        />
                      </span>
                      <button
                        className="track-title"
                        role="cell"
                        onClick={(event) => {
                          if (event.detail === 0) play(track);
                        }}
                        title={
                          track.available
                            ? "Double-click row or activate to play"
                            : "File unavailable — reconnect its folder"
                        }
                      >
                        <span className="track-name">{track.title}</span>
                        {!track.available && (
                          <span className="muted"> · unavailable</span>
                        )}
                      </button>
                      <span
                        role="cell"
                        className="muted extra truncate"
                        title={track.artist}
                      >
                        {track.artist}
                      </span>
                      <span role="cell" className="muted track-duration">
                        {duration(track.duration)}
                      </span>
                      <span role="cell" className="row-actions">
                        <button
                          className={`iconbtn ${track.liked ? "active" : ""}`}
                          aria-label={`${track.liked ? "Unfavourite" : "Favourite"} ${track.title}`}
                          onClick={() => void favourite(track)}
                        >
                          <Heart
                            size={15}
                            fill={track.liked ? "currentColor" : "none"}
                          />
                        </button>
                        <button
                          className="iconbtn"
                          aria-label={`Queue ${track.title}`}
                          onClick={() =>
                            void useMuse
                              .getState()
                              .control({ action: "append", ids: [track.id] })
                          }
                        >
                          <ListPlus size={15} />
                        </button>
                      </span>
                    </>
                  ) : (
                    <span className="muted">Loading tracks…</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {playlistIds && (
        <AddToPlaylist ids={playlistIds} onClose={() => setPlaylistIds(null)} />
      )}
    </section>
  );
}
