import { useState } from "react";
import { Play, Plus, Shuffle } from "lucide-react";
import { api } from "../native";
import { useMuse } from "../store";
import { Dialog, Empty, Heading } from "./shared";
import { PlaylistCollageCard } from "./playlist-collage";
import { TrackList } from "./tracks";

export function PlaylistsScreen() {
  const playlists = useMuse((s) => s.library.playlists),
    navigate = useMuse((s) => s.navigate);
  const [creating, setCreating] = useState(false),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false);
  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await api.playlist("create", null, name.trim());
      await useMuse.getState().refresh();
      setCreating(false);
      setName("");
    } catch (e) {
      useMuse.getState().fail(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        overline="YOUR COLLECTION"
        title="Playlists."
        actions={
          <button className="primary" onClick={() => setCreating(true)}>
            <Plus size={14} />
            Create playlist
          </button>
        }
      >
        Collections for every mood.
      </Heading>
      <div className="playlist-grid">
        <PlaylistCollageCard id={null} name="Favourites" detail="Your saved songs" onOpen={()=>navigate("favourites")} />
        {playlists.map(p=><PlaylistCollageCard key={p.id} id={p.id} name={p.name} detail={`${p.tracks.toLocaleString()} tracks`} onOpen={()=>navigate("playlist",p.id)} />)}
      </div>
      {!playlists.length && (
        <p className="sub" style={{ marginTop: 24 }}>
          Create a playlist, then select tracks in your library to add them.
        </p>
      )}
      {creating && (
        <Dialog title="Create playlist" onClose={() => setCreating(false)}>
          <form
            className="dialog-form"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <label htmlFor="playlist-name">Playlist name</label>
            <input
              id="playlist-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              autoFocus
            />
            <button
              className="primary"
              disabled={busy || !name.trim()}
              type="submit"
            >
              Create playlist
            </button>
          </form>
        </Dialog>
      )}
    </>
  );
}
export function PlaylistScreen() {
  const id = useMuse((s) => s.context),
    playlist = useMuse((s) => s.library.playlists.find((p) => p.id === id));
  const [editing, setEditing] = useState(false),
    [deleting, setDeleting] = useState(false),
    [name, setName] = useState(playlist?.name ?? ""),
    [busy, setBusy] = useState(false);
  async function change(action: "rename" | "delete") {
    if (busy) return;
    setBusy(true);
    try {
      await api.playlist(action, id, name);
      await useMuse.getState().refresh();
      setEditing(false);
      setDeleting(false);
      if (action === "delete") useMuse.getState().navigate("playlists");
    } catch (e) {
      useMuse.getState().fail(e);
    } finally {
      setBusy(false);
    }
  }
  if (!playlist)
    return (
      <Empty title="Playlist unavailable.">
        <button
          className="secondary"
          onClick={() => useMuse.getState().navigate("playlists")}
        >
          Back to playlists
        </button>
      </Empty>
    );
  const query = { playlistId: id };
  return (
    <>
      <Heading
        overline="YOUR OWN MIX"
        title={playlist.name}
        actions={
          <>
            <button
              className="secondary"
              onClick={() => {
                setName(playlist.name);
                setEditing(true);
              }}
            >
              Rename
            </button>
            <button className="secondary" onClick={() => setDeleting(true)}>
              Delete playlist
            </button>
          </>
        }
      >
        {playlist.tracks} tracks
      </Heading>
      <div className="actions">
        <button
          className="primary"
          disabled={!playlist.tracks}
          onClick={() =>
            void useMuse.getState().control({ action: "play", query })
          }
        >
          <Play size={14} />
          Play playlist
        </button>
        <button
          className="secondary"
          disabled={!playlist.tracks}
          onClick={() =>
            void useMuse
              .getState()
              .control({ action: "play", query, mode: "shuffle" })
          }
        >
          <Shuffle size={14} />
          Shuffle
        </button>
      </div>
      <TrackList query={query} />
      {editing && (
        <Dialog title="Rename playlist" onClose={() => setEditing(false)}>
          <form
            className="dialog-form"
            onSubmit={(e) => {
              e.preventDefault();
              void change("rename");
            }}
          >
            <label htmlFor="rename-playlist">Playlist name</label>
            <input
              id="rename-playlist"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              autoFocus
            />
            <button className="primary" disabled={busy || !name.trim()}>
              Save name
            </button>
          </form>
        </Dialog>
      )}
      {deleting && (
        <Dialog title="Delete playlist?" onClose={() => setDeleting(false)}>
          <p className="sub">
            Remove “{playlist.name}” from Muse? Your music files and other
            playlists are kept.
          </p>
          <div className="actions">
            <button className="secondary" onClick={() => setDeleting(false)}>
              Cancel
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void change("delete")}
            >
              Delete playlist
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
