import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown,
  ArrowUp,
  Heart,
  ListMusic,
  Maximize2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { api, artwork } from "../native";
import { useMuse } from "../store";
import type { Track } from "../types";
import { VisualEffectsTab } from "./visual-effects";
import { LyricsPanel } from "./lyrics";
import { Cover, Empty, Heading } from "./shared";
import { duration } from "../format";
import { AddToPlaylist } from "./tracks";
import { AudioOutputButton } from "./audio-output";

function revealQueue() {
  const queue = document.getElementById("playback-queue");
  const content = queue?.closest<HTMLElement>("#main-content");
  if (!queue || !content) return;
  // scrollIntoView also moves overflow:hidden ancestors, including the
  // artwork wrapper. Those offsets cannot be undone with normal scrolling.
  content.scrollTo({
    top:
      content.scrollTop +
      queue.getBoundingClientRect().top -
      content.getBoundingClientRect().top -
      content.clientTop,
    behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
  });
  queue.focus({ preventScroll: true });
}

export function Transport({ expanded = false }: { expanded?: boolean }) {
  const playing = useMuse((s) => s.playback.playing),
    shuffle = useMuse((s) => s.playback.shuffle),
    repeat = useMuse((s) => s.playback.repeat),
    hasTrack = useMuse((s) => !!s.playback.current),
    control = useMuse((s) => s.control);
  return (
    <div
      className={`controls ${expanded ? "now-transport" : ""}`}
      role="group"
      aria-label="Playback controls"
    >
      <button
        className={`iconbtn ${shuffle ? "active" : ""}`}
        aria-label="Shuffle"
        aria-pressed={shuffle}
        onClick={() => void control({ action: "shuffle" })}
      >
        <Shuffle size={17} />
      </button>
      <button
        className="iconbtn"
        aria-label="Previous track"
        disabled={!hasTrack}
        onClick={() => void control({ action: "previous" })}
      >
        <SkipBack size={19} fill="currentColor" />
      </button>
      <button
        className="playbtn"
        aria-label={playing ? "Pause" : "Play"}
        disabled={!hasTrack}
        onClick={() => void control({ action: "toggle" })}
      >
        {playing ? (
          <Pause size={17} fill="currentColor" />
        ) : (
          <Play size={17} fill="currentColor" />
        )}
      </button>
      <button
        className="iconbtn"
        aria-label="Next track"
        disabled={!hasTrack}
        onClick={() => void control({ action: "next" })}
      >
        <SkipForward size={19} fill="currentColor" />
      </button>
      <button
        className={`iconbtn ${repeat !== "off" ? "active" : ""}`}
        aria-label={`Repeat: ${repeat}`}
        aria-pressed={repeat !== "off"}
        onClick={() => void control({ action: "repeat" })}
      >
        {repeat === "one" ? <Repeat1 size={18} /> : <Repeat size={18} />}
      </button>
    </div>
  );
}
export function SeekBar({ showTime = false }: { showTime?: boolean }) {
  const position = useMuse((s) => s.playback.position),
    length = useMuse((s) => s.playback.current?.duration ?? 0);
  const [draft, setDraft] = useState<number | null>(null);
  const value = Math.min(draft ?? position, Math.max(1, length));
  const commit = () => {
    if (draft !== null) {
      void useMuse.getState().control({ action: "seek", value: draft });
      setDraft(null);
    }
  };
  return (
    <div className="seek-control">
      {showTime && <span className="time">{duration(draft ?? position)}</span>}
      <input
        className="progress"
        type="range"
        min={0}
        max={Math.max(1, length)}
        step={0.1}
        value={value}
        style={
          {
            "--range-progress": `${length ? (value / length) * 100 : 0}%`,
          } as CSSProperties
        }
        disabled={!length}
        onChange={(e) => setDraft(+e.target.value)}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        aria-label="Playback position"
        aria-valuetext={`${duration(draft ?? position)} of ${duration(length)}`}
      />
      {showTime && <span className="time">{duration(length)}</span>}
    </div>
  );
}
export function VolumeControl({ rememberedVolume }: { rememberedVolume?: { current: number } } = {}) {
  const volume = useMuse((s) => s.playback.volume);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<number | null>(null);
  const previousVolume = useRef(volume || 0.8);
  const audibleVolume = rememberedVolume ?? previousVolume;
  if (volume > 0) audibleVolume.current = volume;
  const [draftVolume, setDraftVolume] = useState<number | null>(null);
  useEffect(() => () => {
    clearTimeout(timer.current);
    if (pending.current !== null) void useMuse.getState().control({ action: "volume", value: pending.current });
  }, []);
  return (
    <>
      <button
        className="iconbtn"
        aria-label={volume ? "Mute" : "Unmute"}
        onClick={() => {
          clearTimeout(timer.current); pending.current = null; setDraftVolume(null);
          void useMuse.getState().control({ action: "volume", value: volume ? 0 : audibleVolume.current });
        }}
      >
        {volume ? <Volume2 size={17} /> : <VolumeX size={17} />}
      </button>
      <input
        className="volume"
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={draftVolume ?? volume}
        style={
          {
            "--range-progress": `${(draftVolume ?? volume) * 100}%`,
          } as CSSProperties
        }
        onChange={(e) => {
          const value = +e.target.value;
          setDraftVolume(value); pending.current = value;
          clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            pending.current = null;
            void useMuse.getState().control({ action: "volume", value });
            setDraftVolume(null);
          }, 70);
        }}
        aria-label="Volume"
      />
    </>
  );
}

function VolumePopover() {
  const volume=useMuse(s=>s.playback.volume);
  const [open,setOpen]=useState(false);
  const rememberedVolume=useRef(volume || 0.8);
  if(volume>0) rememberedVolume.current=volume;
  const root=useRef<HTMLDivElement>(null), trigger=useRef<HTMLButtonElement>(null);
  const id=useId();
  useEffect(()=>{
    if(!open)return;
    root.current?.querySelector<HTMLInputElement>('input[type="range"]')?.focus({preventScroll:true});
    function outside(event:PointerEvent) {if(root.current && !event.composedPath().includes(root.current))setOpen(false);}
    document.addEventListener("pointerdown",outside);
    return()=>document.removeEventListener("pointerdown",outside);
  },[open]);
  return <div className="now-volume-popover" ref={root} onKeyDown={event=>{
    if(open && event.key==="Escape") {event.preventDefault();event.stopPropagation();setOpen(false);trigger.current?.focus({preventScroll:true});}
  }}>
    <button ref={trigger} className="iconbtn" aria-label="Adjust volume" title="Adjust volume" aria-haspopup="dialog" aria-expanded={open} aria-controls={open?id:undefined} onClick={()=>setOpen(value=>!value)}>{volume ? <Volume2 size={22}/> : <VolumeX size={22}/>}</button>
    {open && <div className="now-volume-panel" id={id} role="dialog" aria-label="Volume controls"><VolumeControl rememberedVolume={rememberedVolume}/></div>}
  </div>;
}
function NowPlayingToolbar() {
  return <div className="now-toolbar" role="group" aria-label="Now Playing controls">
    <VolumePopover/>
    <Transport expanded/>
    <div className="now-toolbar-end">
      <AudioOutputButton/>
      <button className="iconbtn" aria-label="Open playback queue" onClick={revealQueue}><ListMusic size={22}/></button>
    </div>
  </div>;
}

export function MiniPlayer() {
  const track = useMuse((s) => s.playback.current),
    expanded = useMuse((s) => s.page === "now"),
    navigate = useMuse((s) => s.navigate);
  return (
    <footer className="player" aria-label="Music player">
      <div className="player-main">
        <button
          className="thumb"
          aria-label="Open Now Playing"
          title="Expand Now Playing"
          onClick={() => navigate("now")}
        >
          <Cover
            key={track?.cover ?? track?.id}
            path={track?.cover}
            remote={track?.id.startsWith("sftp:")}
            title={track?.album ?? "♪"}
            artist={track?.artist}
          />
          <span className="thumb-expand" aria-hidden="true">
            <Maximize2 size={22} />
          </span>
        </button>
        <button className="track-meta" onClick={() => navigate("now")}>
          <div className="name">{track?.title ?? "No track selected"}</div>
          <div className="artist">{track?.artist ?? "Your music awaits"}</div>
        </button>
        <Transport />
        <div className="player-side">
          <span className="time">{duration(track?.duration ?? 0)}</span>
          <VolumeControl />
          <AudioOutputButton />
          <button
            className="iconbtn"
            aria-label="Open playback queue"
            onClick={() =>
              expanded ? revealQueue() : navigate("now", "queue")
            }
          >
            <ListMusic size={18} />
          </button>
        </div>
      </div>
      <SeekBar key={track?.id} />
    </footer>
  );
}

function Queue() {
  const ids = useMuse((s) => s.playback.queue),
    index = useMuse((s) => s.playback.index);
  const scroll = useRef<HTMLDivElement>(null);
  const [tracks, setTracks] = useState<Map<string, Track>>(new Map());
  const pending = useRef(new Set<string>());
  const virtual = useVirtualizer({
    count: ids.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => 48,
    overscan: 5,
  });
  const items = virtual.getVirtualItems();
  const wanted = items
    .map((i) => ids[i.index])
    .filter((id) => !tracks.has(id) && !pending.current.has(id));
  useEffect(() => {
    if (!wanted.length) return;
    for (const id of wanted) pending.current.add(id);
    void api
      .getTracks(wanted)
      .then((rows) =>
        setTracks((old) => {
          const next = new Map(old);
          for (const row of rows) next.set(row.id, row);
          return next;
        }),
      )
      .catch((e) => useMuse.getState().fail(e))
      .finally(() => {
        for (const id of wanted) pending.current.delete(id);
      });
  }, [wanted]);
  return (
    <section className="queue-section" aria-labelledby="queue-title">
      <div className="filter-row">
        <h2 id="queue-title" className="section-title">
          Playback queue · {ids.length.toLocaleString()}
        </h2>
        <button
          className="secondary"
          disabled={!ids.length}
          onClick={() => void useMuse.getState().control({ action: "clear" })}
        >
          Clear queue
        </button>
      </div>
      {!ids.length ? (
        <Empty title="Play an album or add songs to your queue." />
      ) : (
        <div className="queue-scroll" ref={scroll} tabIndex={0}>
          <div style={{ height: virtual.getTotalSize(), position: "relative" }}>
            {items.map((item) => {
              const id = ids[item.index],
                track = tracks.get(id);
              return (
                <div
                  className={`queue-row ${item.index === index ? "playing" : ""}`}
                  key={`${id}-${item.index}`}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: 48,
                    transform: `translateY(${item.start}px)`,
                  }}
                >
                  <button
                    className="queue-track"
                    onClick={() =>
                      void useMuse
                        .getState()
                        .control({ action: "jump", index: item.index })
                    }
                  >
                    <span className="muted">{item.index + 1}</span>
                    <span className="truncate">
                      {track?.title ?? "Loading…"}
                      <small>{track?.artist}</small>
                    </span>
                  </button>
                  <button
                    className="iconbtn"
                    aria-label="Move queue track earlier"
                    disabled={item.index === 0}
                    onClick={() =>
                      void useMuse.getState().control({
                        action: "move",
                        index: item.index,
                        to: item.index - 1,
                      })
                    }
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    className="iconbtn"
                    aria-label="Move queue track later"
                    disabled={item.index === ids.length - 1}
                    onClick={() =>
                      void useMuse.getState().control({
                        action: "move",
                        index: item.index,
                        to: item.index + 1,
                      })
                    }
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    className="iconbtn"
                    aria-label={`Remove ${track?.title ?? "track"} from queue`}
                    onClick={() =>
                      void useMuse
                        .getState()
                        .control({ action: "remove", index: item.index })
                    }
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
export function NowPlayingScreen() {
  const [tab, setTab] = useState<"playing" | "lyrics" | "visuals">("playing");
  const [visualWide,setVisualWide]=useState(false);
  const track = useMuse((s) => s.playback.current),
    context = useMuse((s) => s.context),
    revision = useMuse((s) => s.revision);
  const cover = useMuse(
    (s) =>
      s.playback.current?.cover ??
      s.library.albums.find((album) => album.id === s.playback.current?.albumId)
        ?.cover,
  );
  const [favouriteState, setFavouriteState] = useState<{
      id: string;
      liked: boolean;
    }>(),
    [add, setAdd] = useState<string | null>(null);
  const liked =
    favouriteState?.id === track?.id
      ? (favouriteState?.liked ?? false)
      : (track?.liked ?? false);
  const source = artwork(cover);
  useEffect(() => {
    if (context !== "queue") return;
    revealQueue();
  }, [context]);
  const trackId = track?.id;
  useEffect(() => {
    let active = true;
    if (trackId)
      void api
        .getTracks([trackId])
        .then((rows) => {
          if (active)
            setFavouriteState({ id: trackId, liked: rows[0]?.liked ?? false });
        })
        .catch(useMuse.getState().fail);
    return () => {
      active = false;
    };
  }, [trackId, revision]);
  if (!track)
    return (
      <article className="now-page now-empty">
        <div className="now-empty-content">
          <Heading overline="NOW PLAYING" title="Make yourself at home." />
          <Empty title="Choose something from your library to listen.">
            <button
              className="primary"
              onClick={() => useMuse.getState().navigate("library")}
            >
              Browse your library
            </button>
          </Empty>
        </div>
        <NowPlayingToolbar/>
        <div
          className="now-queue"
          id="playback-queue"
          role="region"
          tabIndex={-1}
          aria-label="Playback queue"
        >
          <Queue />
        </div>
      </article>
    );
  async function favourite() {
    if (!track) return;
    try {
      await api.favourite(track.id, !liked);
      setFavouriteState({ id: track.id, liked: !liked });
      await useMuse.getState().refresh();
    } catch (e) {
      useMuse.getState().fail(e);
    }
  }
  return (
    <article className={`now-page ${tab==="visuals"&&visualWide?"now-page--visual-wide":""}`} aria-label="Now Playing">
      {source && (
        <img
          key={source}
          className="now-atmosphere-art"
          src={source}
          alt=""
          aria-hidden="true"
          onError={(event) => {
            event.currentTarget.style.visibility = "hidden";
          }}
        />
      )}
      <div className="now-atmosphere-overlay" aria-hidden="true" />
      <div className="now-main">
        <div className="now-artwork" hidden={tab==="visuals"&&visualWide}>
          <Cover
            key={cover}
            path={cover}
            remote={track.id.startsWith("sftp:")}
            title={track.album}
            artist={track.artist}
          />
        </div>
        <div className="now-information">
          <div className="now-tabs" role="tablist" aria-label="Now Playing views">
            {(["playing", "lyrics", "visuals"] as const).map(value => <button key={value} id={`now-tab-${value}`} role="tab" aria-selected={tab===value} aria-controls={`now-panel-${value}`} tabIndex={tab===value?0:-1} onClick={()=>setTab(value)} onKeyDown={event=>{if(["ArrowLeft","ArrowRight","Home","End"].includes(event.key)){event.preventDefault();const values=["playing","lyrics","visuals"] as const;const next=event.key==="Home"?values[0]:event.key==="End"?values[2]:values[(values.indexOf(value)+(event.key==="ArrowRight"?1:2))%3];setTab(next);document.getElementById(`now-tab-${next}`)?.focus();}}}>{value==="playing"?"NOW PLAYING":value==="lyrics"?"LYRICS":"VISUAL EFFECTS"}</button>)}
          </div>
          <div className="now-view-panels">
          <div id="now-panel-visuals" className="now-view-panel" role="tabpanel" hidden={tab!=="visuals"} aria-labelledby="now-tab-visuals">{tab==="visuals" && <VisualEffectsTab source={source} expanded={visualWide} onExpandedChange={setVisualWide}/>}</div>
          <div id="now-panel-lyrics" className="now-view-panel" role="tabpanel" hidden={tab!=="lyrics"} aria-labelledby="now-tab-lyrics">{tab==="lyrics" && <LyricsPanel key={track.id} trackId={track.id} />}</div>
          <div id="now-panel-playing" className="now-view-panel" role="tabpanel" hidden={tab!=="playing"} aria-labelledby="now-tab-playing">
          <h1 className="now-title">{track.title}</h1>
          <div className="now-artist">
            <button
              className="text-link"
              onClick={() =>
                useMuse.getState().navigate("artist", track.artist)
              }
            >
              {track.artist}
            </button>
          </div>
          <div className="now-album">
            <button
              className="text-link"
              onClick={() =>
                useMuse.getState().navigate("album", track.albumId)
              }
            >
              {track.album}
            </button>
          </div>
          <div className="now-metadata">
            {[track.year, track.genre, duration(track.duration)]
              .filter(Boolean)
              .join(" · ")}
          </div>
          <div className="actions now-actions">
            <button
              className={`secondary ${liked ? "active" : ""}`}
              aria-pressed={liked}
              onClick={() => void favourite()}
            >
              <Heart size={15} fill={liked ? "currentColor" : "none"} />
              {liked ? "Favourited" : "Favourite"}
            </button>
            <button className="secondary" onClick={() => setAdd(track.id)}>
              Add to playlist
            </button>
          </div>
          </div>
          </div>
          <div className="now-playback">
            <SeekBar key={track.id} showTime />
            <NowPlayingToolbar/>
          </div>
        </div>
      </div>
      <div
        className="now-queue"
        id="playback-queue"
        role="region"
        tabIndex={-1}
        aria-label="Playback queue"
      >
        <Queue />
      </div>
      {add && (
        <AddToPlaylist key={add} ids={[add]} onClose={() => setAdd(null)} />
      )}
    </article>
  );
}
