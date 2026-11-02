import { useEffect, useState, type CSSProperties } from "react";
import { Heart, Pin, Play, Shuffle, Sparkles } from "lucide-react";
import { useMuse } from "../store";
import { api, artwork } from "../native";
import { useAlbumAtmosphere } from "../use-album-atmosphere";
import { AlbumCard, Cover, Empty, Heading } from "./shared";
import { albumDisplayTitle, totalTime } from "../format";
import { AlbumInfoDialog } from "./ai";
import { AddToPlaylist, TrackList } from "./tracks";
import type { Tile, TrackQuery } from "../types";

export function LibraryScreen() {
  const library = useMuse((s) => s.library),
    navigate = useMuse((s) => s.navigate);
  const { tab, sort } = useMuse((s) => s.libraryView);
  const setView = useMuse((s) => s.setLibraryView);
  const albums = [...library.albums].sort((a, b) =>
    sort === "artist"
      ? a.artist.localeCompare(b.artist)
      : sort === "added"
        ? b.addedAt - a.addedAt
        : sort === "year"
          ? (b.year ?? 0) - (a.year ?? 0)
          : a.title.localeCompare(b.title),
  );
  return (
    <>
      <Heading overline="ALL THE MUSIC YOU LOVE" title="Your library.">
        {library.tracks.toLocaleString()} songs ·{" "}
        {library.albums.length.toLocaleString()} albums
      </Heading>
      <div className="filter-row">
        <div className="pills">
          {["albums", "artists", "songs", "genres"].map((value) => (
            <button
              key={value}
              className={`pill ${tab === value ? "selected" : ""}`}
              onClick={() => setView({ tab: value })}
            >
              {value[0].toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>
        <label className="sort-label">
          Sort by
          <select
            value={sort}
            onChange={(e) => setView({ sort: e.target.value })}
          >
            <option value="title">Title</option>
            <option value="artist">Artist</option>
            <option value="added">Date added</option>
            <option value="year">Year</option>
          </select>
        </label>
      </div>
      {!library.tracks ? (
        <Empty title="Give your music a home.">
          <p>Add a folder to start building your library.</p>
          <button
            className="primary"
            onClick={() => void useMuse.getState().importFolders()}
          >
            Import music
          </button>
        </Empty>
      ) : tab === "albums" ? (
        <div className="albums">
          {albums.map((album) => (
            <AlbumCard album={album} key={album.id} />
          ))}
        </div>
      ) : tab === "songs" ? (
        <TrackList query={{ sort }} />
      ) : (
        <div className="albums">
          {(tab === "artists" ? library.artists : library.genres).map(
            (item) => (
              <button
                key={item.name}
                className="albumcard"
                onClick={() =>
                  navigate(tab === "artists" ? "artist" : "genre", item.name)
                }
              >
                <div className="cover">
                  <Cover path={item.cover} title={item.name} />
                </div>
                <div className="albumtitle">{item.name}</div>
                <div className="albumartist">
                  {item.tracks.toLocaleString()} tracks
                </div>
              </button>
            ),
          )}
        </div>
      )}
    </>
  );
}
export function AlbumScreen() {
  const id = useMuse((s) => s.context),
    album = useMuse((s) => s.library.albums.find((a) => a.id === id)),
    tiles = useMuse((s) => s.library.tiles),
    revision = useMuse((s) => s.revision);
  const source = artwork(album?.cover);
  const theme = useAlbumAtmosphere(source);
  const themeStyle = Object.fromEntries(
    Object.entries(theme).map(([key, value]) => [
      `--album-${key === "onAccent" ? "on-accent" : key}`,
      value,
    ]),
  ) as CSSProperties;
  const [infoOpen,setInfoOpen]=useState(false);
  const [playlistIds, setPlaylistIds] = useState<string[] | null>(null),
    [allLiked, setAllLiked] = useState(false);
  useEffect(() => {
    let active = true;
    void api
      .tracks({ albumId: id, favourites: true, limit: 1 })
      .then((data) => {
        if (active) setAllLiked(data.total > 0 && data.total === album?.tracks);
      })
      .catch(useMuse.getState().fail);
    return () => {
      active = false;
    };
  }, [id, revision, album?.tracks]);
  if (!album)
    return (
      <Empty title="This album is no longer in your library.">
        <button
          className="secondary"
          onClick={() => useMuse.getState().navigate("library")}
        >
          Back to library
        </button>
      </Empty>
    );
  const query = { albumId: id, sort: "album" };
  async function albumIds() {
    return api.trackIds(query);
  }
  async function favourite() {
    try {
      const ids = await albumIds();
      await api.favourites(ids, !allLiked);
      setAllLiked(!allLiked);
      await useMuse.getState().refresh();
    } catch (e) {
      useMuse.getState().fail(e);
    }
  }
  const pinned = tiles.some((t) => t.kind === "album" && t.target === id);
  const display = albumDisplayTitle(album.title);
  const pin = () =>
    void useMuse.getState().saveTiles(
      pinned
        ? tiles.filter((t) => !(t.kind === "album" && t.target === id))
        : [
            ...tiles,
            {
              id: crypto.randomUUID(),
              kind: "album",
              target: id,
              size: "small",
            } satisfies Tile,
          ],
    );
  return (
    <article className="album-page" style={themeStyle}>
      <header className="album-hero">
        <div className="album-hero-content">
          <div className="detail album-hero-grid">
            <div className="detail-cover" data-album-hero={album.id}>
              <Cover
                key={source}
                path={album.cover}
                remote={album.id.startsWith("sftp:")}
                title={album.title}
                artist={album.artist}
              />
            </div>
            <div>
              <div data-album-enter="title">
                <div className="eyebrow">
                  <button
                    className="text-link"
                    onClick={() =>
                      useMuse.getState().navigate("artist", album.artist)
                    }
                  >
                    {album.artist}
                  </button>
                  {album.year ? ` · ${album.year}` : ""}
                </div>
                <h1 className="heading">{display.title}</h1>
                {display.edition && (
                  <p className="album-edition">{display.edition}</p>
                )}
              </div>
              <div className="album-info" data-album-enter="metadata">
                {album.tracks} tracks · {totalTime(album.duration)}
                {album.genre ? ` · ${album.genre}` : ""}
              </div>
              <div className="actions" data-album-enter="actions">
                <button
                  className="primary"
                  onClick={() =>
                    void useMuse.getState().control({ action: "play", query })
                  }
                >
                  <Play size={14} fill="currentColor" />
                  Play album
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    void useMuse
                      .getState()
                      .control({ action: "play", query, mode: "shuffle" })
                  }
                >
                  <Shuffle size={14} />
                  Shuffle
                </button>
                <button
                  className={`secondary ${allLiked ? "active" : ""}`}
                  onClick={() => void favourite()}
                >
                  <Heart size={14} />
                  Favourite{allLiked ? "d" : ""}
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    void albumIds()
                      .then(setPlaylistIds)
                      .catch(useMuse.getState().fail)
                  }
                >
                  Add to playlist
                </button>
                <button className="secondary" onClick={()=>setInfoOpen(true)}><Sparkles size={14}/>Search album info</button>
                <button
                  className={`secondary ${pinned ? "active" : ""}`}
                  onClick={pin}
                >
                  <Pin size={14} />
                  {pinned ? "Unpin" : "Pin"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>
      <div className="album-tracks" data-album-enter="tracks">
        <TrackList query={query} caption={`${album.title} tracks`} />
      </div>
      {infoOpen && <AlbumInfoDialog albumId={album.id} onClose={()=>setInfoOpen(false)}/>}
      {playlistIds && (
        <AddToPlaylist ids={playlistIds} onClose={() => setPlaylistIds(null)} />
      )}
    </article>
  );
}
export function SongsScreen() {
  const page = useMuse((s) => s.page),
    context = useMuse((s) => s.context),
    search = useMuse((s) => s.search),
    tiles = useMuse((s) => s.library.tiles);
  const albums = useMuse(s=>s.library.albums), revision=useMuse(s=>s.revision);
  const [artistAlbums,setArtistAlbums]=useState<{artist:string;ids:string[]}|null>(null);
  useEffect(()=>{
    if(page!=="artist")return;
    let active=true;
    void api.artistAlbumIds(context).then(ids=>{if(active)setArtistAlbums({artist:context,ids});}).catch(error=>{if(active){setArtistAlbums({artist:context,ids:[]});useMuse.getState().fail(error);}});
    return ()=>{active=false;};
  },[page,context,revision]);
  const relatedAlbums=artistAlbums?.artist===context ? albums.filter(album=>artistAlbums.ids.includes(album.id)).sort((a,b)=>a.title.localeCompare(b.title)) : [];
  const [sort, setSort] = useState(
      context === "recently-added" ? "added" : "title",
    ),
    [debounced, setDebounced] = useState(search);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 130);
    return () => clearTimeout(timer);
  }, [search]);
  const query: TrackQuery = {
    search: debounced,
    sort,
    ...(page === "favourites"
      ? { favourites: true }
      : page === "artist"
        ? { artist: context }
        : page === "genre"
          ? { genre: context }
          : {}),
  };
  const title = search
    ? "Search results."
    : page === "favourites"
      ? "Favourites."
      : page === "artist" || page === "genre"
        ? context
        : "All songs.";
  const pinned = tiles.some((t) => t.kind === "artist" && t.target === context);
  const pin = () =>
    void useMuse.getState().saveTiles(
      pinned
        ? tiles.filter((t) => !(t.kind === "artist" && t.target === context))
        : [
            ...tiles,
            {
              id: crypto.randomUUID(),
              kind: "artist",
              target: context,
              size: "wide",
            },
          ],
    );
  return (
    <>
      <Heading
        overline="YOUR COLLECTION"
        title={title}
        actions={
          page === "artist" ? (
            <button className="secondary" onClick={pin}>
              <Pin size={14} />
              {pinned ? "Unpin artist" : "Pin artist"}
            </button>
          ) : undefined
        }
      >
        {search ? `Results for “${search}”` : "Your music, on your terms."}
      </Heading>
      {page==="artist" && <section className="artist-albums-section" aria-label={`${context} albums`}>
        <h2 className="section-title">Albums</h2>
        {artistAlbums?.artist!==context ? <p className="sub" role="status">Loading albums…</p> : relatedAlbums.length ? <div className="albums">{relatedAlbums.map(album=><AlbumCard key={album.id} album={album}/>)}</div> : <p className="sub">No albums available.</p>}
      </section>}
      {page==="artist" && <h2 className="section-title">Songs</h2>}
      <div className="filter-row">
        <div className="actions">
          <button
            className="primary"
            onClick={() =>
              void useMuse.getState().control({ action: "play", query })
            }
          >
            <Play size={14} />
            Play
          </button>
          <button
            className="secondary"
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
        <label className="sort-label">
          Sort by
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="title">Title</option>
            <option value="artist">Artist</option>
            <option value="added">Date added</option>
            <option value="year">Year</option>
          </select>
        </label>
      </div>
      <TrackList query={query} />
    </>
  );
}
