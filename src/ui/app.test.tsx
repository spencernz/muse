import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SettingsScreen } from "./settings";
import { App } from "./app";
import { AddToPlaylist, TrackList } from "./tracks";
import { api } from "../native";
import { useMuse } from "../store";
import { emptyLibrary, emptyPlayback } from "../types";
import { albumDisplayTitle } from "../format";
import { atmosphereFromPixels, defaultAtmosphere } from "../album-atmosphere";
import type { Track } from "../types";

vi.mock("@tauri-apps/api/event",()=>({listen:async()=>()=>{}}));
vi.mock("../native", () => ({
  native: true,
  artwork: (path: string) => path,
  api: {
    visualizerActive:vi.fn(),
    visualizerFrame:vi.fn(),
    lyrics: vi.fn(),
    importLyrics: vi.fn(),
    artistAlbumIds: vi.fn(),
    playlistCovers: vi.fn(),
    windowFullscreen: vi.fn(),
    exitFullscreen: vi.fn(),
    bootstrap: vi.fn(),
    preferences: vi.fn(),
    setCloseBehavior: vi.fn(),
    library: vi.fn(),
    tracks: vi.fn(),
    getTracks: vi.fn(),
    trackIds: vi.fn(),
    player: vi.fn(),
    favourite: vi.fn(),
    favourites: vi.fn(),
    playlist: vi.fn(),
    tiles: vi.fn(),
    rescan: vi.fn(),
    stopScan: vi.fn(),
    removeFolder: vi.fn(),
    importFolders: vi.fn(),
  },
}));
const song: Track = {
  id: "song-1",
  title: "First light",
  artist: "Sample Artist",
  album: "Evening studies",
  albumArtist: "Sample Artist",
  albumId: "album-1",
  year: 2026,
  genre: "Ambient",
  duration: 180,
  trackNo: 1,
  discNo: 1,
  cover: "/cached/cover.jpg",
  liked: false,
  available: true,
  addedAt: 123,
};
const album = {
  id: song.albumId,
  title: song.album,
  artist: song.artist,
  year: 2026,
  genre: "Ambient",
  cover: song.cover,
  duration: 180,
  tracks: 1,
  addedAt: 123,
  lastPlayed: 0,
};
const library = {
  ...emptyLibrary,
  tracks: 1,
  albums: [album],
  tiles: [
    {
      id: "one",
      kind: "recent" as const,
      size: "medium" as const,
      target: null,
    },
    {
      id: "two",
      kind: "favourites" as const,
      size: "small" as const,
      target: null,
    },
  ],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.windowFullscreen).mockResolvedValue(false);
  vi.mocked(api.exitFullscreen).mockResolvedValue(undefined);
  vi.mocked(api.artistAlbumIds).mockResolvedValue([]);
  vi.mocked(api.playlistCovers).mockResolvedValue([]);
  act(() =>
    useMuse.setState({
      library,
      playback: { ...emptyPlayback, current: song, queue: [song.id] },
      page: "home",
      context: "",
      search: "",
      loading: false,
      error: null,
      notice: null,
      importing: false,
      revision: 0,
      navigationHistory: [],
      libraryView: { tab: "albums", sort: "title" },
      scan: {
        running: false,
        scanned: 0,
        changed: 0,
        errors: 0,
        current: "",
        message: "",
      },
    }),
  );
  vi.mocked(api.library).mockResolvedValue(library);
  vi.mocked(api.tracks).mockResolvedValue({ items: [song], total: 1 });
  vi.mocked(api.getTracks).mockResolvedValue([song]);
  vi.mocked(api.player).mockResolvedValue({
    ...emptyPlayback,
    current: song,
    queue: [song.id],
  });
});
afterEach(cleanup);

it("keeps the player visible across navigation and displays embedded artwork", async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("button", { name: "Library" }));
  expect(screen.getByRole("heading", { name: "Your library." })).toBeVisible();
  expect(
    screen.getAllByRole("img", { name: "Cover for Evening studies" })[0],
  ).toHaveAttribute("src", "/cached/cover.jpg");
  expect(
    screen.getByRole("contentinfo", { name: "Music player" }),
  ).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Playlists" }));
  expect(screen.getByRole("heading", { name: "Playlists." })).toBeVisible();
  expect(
    screen.getByRole("contentinfo", { name: "Music player" }),
  ).toBeVisible();
});

it("keeps contextual navigation inside content and returns through route history", async () => {
  const user = userEvent.setup();
  render(<App />);
  const content = screen.getByRole("main");
  const navigation = screen.getByRole("navigation", {
    name: "Content navigation",
  });
  expect(content).toContainElement(navigation);
  const footer = screen.getByRole("contentinfo", { name: "Music player" });
  expect(footer.parentElement).toBe(content.closest(".app"));
  expect(screen.queryByRole("button", { name: "Go back" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Library" }));
  await user.click(
    screen.getByRole("button", {
      name: new RegExp(`^Cover for ${album.title}`),
    }),
  );
  expect(screen.getByRole("heading", { name: album.title })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Go back" }));
  expect(screen.getByRole("heading", { name: "Your library." })).toBeVisible();
  await user.type(screen.getByLabelText("Search music"), "First");
  expect(useMuse.getState().page).toBe("songs");
  await user.click(screen.getByRole("button", { name: "Go back" }));
  expect(useMuse.getState().page).toBe("library");
  expect(screen.getByLabelText("Search music")).toHaveValue("");
  expect(screen.getByRole("contentinfo", { name: "Music player" })).toBe(
    footer,
  );
});

it("separates known edition/disc suffixes without stripping parts of album titles", () => {
  expect(
    albumDisplayTitle(
      "Goodbye Yellow Brick Road [40th Anniversary Edition] CD1",
    ),
  ).toEqual({
    title: "Goodbye Yellow Brick Road",
    edition: "40th Anniversary Edition · CD1",
  });
  expect(albumDisplayTitle("Evening studies (Deluxe Edition)")).toEqual({
    title: "Evening studies",
    edition: "Deluxe Edition",
  });
  expect(albumDisplayTitle("Evening studies - Disc 2")).toEqual({
    title: "Evening studies",
    edition: "Disc 2",
  });
  expect(albumDisplayTitle("(What's the Story) Morning Glory?")).toEqual({
    title: "(What's the Story) Morning Glory?",
    edition: "",
  });
});

it("opens an album with the keyboard and restores the grid sort, scroll and focus on Back", async () => {
  const user = userEvent.setup();
  act(() => useMuse.setState({ page: "library" }));
  render(<App />);
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Sort by" }),
    "artist",
  );
  const content = screen.getByRole("main");
  content.scrollTop = 320;
  const card = screen.getByRole("button", {
    name: new RegExp(`^Cover for ${album.title}`),
  });
  card.focus();
  await user.keyboard("{Enter}");
  expect(useMuse.getState().page).toBe("album");
  expect(screen.getByRole("heading", { name: album.title })).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Go back" }));
  expect(content.scrollTop).toBe(320);
  expect(screen.getByRole("combobox", { name: "Sort by" })).toHaveValue(
    "artist",
  );
  expect(
    screen.getByRole("button", {
      name: new RegExp(`^Cover for ${album.title}`),
    }),
  ).toHaveFocus();
});

it("requests paged native search results without rendering 12,000 rows", async () => {
  vi.mocked(api.tracks).mockResolvedValue({
    items: Array.from({ length: 200 }, (_, i) => ({
      ...song,
      id: `song-${i}`,
      title: `Song ${i}`,
    })),
    total: 12000,
  });
  render(<TrackList query={{ search: "Song" }} />);
  expect(await screen.findByText("12,000 tracks")).toBeVisible();
  await waitFor(() =>
    expect(screen.getAllByRole("row").length).toBeGreaterThan(0),
  );
  expect(screen.getAllByRole("row").length).toBeLessThan(50);
  expect(api.tracks).toHaveBeenCalledWith({
    search: "Song",
    offset: 0,
    limit: 200,
  });
  expect(screen.getByRole("table")).toHaveAttribute("aria-rowcount", "12000");
});

it("searches native metadata after typing and starts the matching queue", async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.type(screen.getByLabelText("Search music"), "First");
  await waitFor(() =>
    expect(api.tracks).toHaveBeenCalledWith(
      expect.objectContaining({ search: "First", limit: 200 }),
    ),
  );
  const row = await screen.findByRole("cell", { name: "First light" });
  await user.dblClick(row);
  expect(api.player).toHaveBeenCalledWith(
    expect.objectContaining({
      action: "play",
      start: song.id,
      query: expect.objectContaining({ search: "First" }),
    }),
  );
  expect(api.player).toHaveBeenCalledOnce();
});

it("persists changed tile sizes and order through native commands", async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("button", { name: "Edit tiles" }));
  await user.selectOptions(
    screen.getByLabelText("Size of Evening studies"),
    "wide",
  );
  await waitFor(() =>
    expect(api.tiles).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "one", size: "wide" }),
      ]),
    ),
  );
  await user.click(
    screen.getByRole("button", { name: "Move favourites earlier" }),
  );
  await waitFor(() =>
    expect(api.tiles).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: "two" }),
      expect.objectContaining({ id: "one" }),
    ]),
  );
});

it("uses the created playlist ID even when names already exist", async () => {
  const user = userEvent.setup();
  act(() =>
    useMuse.setState({
      library: {
        ...library,
        playlists: [{ id: "old", name: "Evening", tracks: 1 }],
      },
    }),
  );
  vi.mocked(api.playlist)
    .mockResolvedValueOnce("new-id")
    .mockResolvedValue(null);
  const close = vi.fn();
  render(<AddToPlaylist ids={[song.id]} onClose={close} />);
  await user.type(screen.getByLabelText("Create a new playlist"), "Evening");
  await user.click(
    screen.getByRole("button", { name: "Create and add tracks" }),
  );
  await waitFor(() =>
    expect(api.playlist).toHaveBeenCalledWith("add", "new-id", null, [song.id]),
  );
  expect(close).toHaveBeenCalledOnce();
});

it("preserves selection after a favourite refresh and reports failures", async () => {
  const user = userEvent.setup();
  render(<TrackList query={{}} />);
  const select = await screen.findByLabelText("Select First light");
  await user.click(select);
  expect(select).toBeChecked();
  act(() => useMuse.setState({ revision: 1 }));
  await waitFor(() =>
    expect(screen.getByLabelText("Select First light")).toBeChecked(),
  );
  vi.mocked(api.favourite).mockRejectedValue(new Error("Storage unavailable"));
  await user.click(
    screen.getByRole("button", { name: "Favourite First light" }),
  );
  await waitFor(() =>
    expect(useMuse.getState().error).toContain("Storage unavailable"),
  );
});

it("handles playback shortcuts while preserving text-field keyboard use", async () => {
  const user = userEvent.setup();
  render(<App />);
  const search = screen.getByLabelText("Search music");
  await user.click(search);
  fireEvent.keyDown(search, { code: "Space", key: " " });
  expect(api.player).not.toHaveBeenCalled();
  fireEvent.keyDown(document.body, { code: "Space", key: " " });
  await waitFor(() =>
    expect(api.player).toHaveBeenCalledWith({ action: "toggle" }),
  );
  fireEvent.keyDown(document.body, { key: "ArrowRight", metaKey: true });
  await waitFor(() =>
    expect(api.player).toHaveBeenCalledWith({ action: "next" }),
  );
});

it("shows native import errors and allows retry without duplicating dialogs", async () => {
  const user = userEvent.setup();
  vi.mocked(api.importFolders)
    .mockRejectedValueOnce(new Error("Folder access denied"))
    .mockResolvedValue(false);
  render(<App />);
  await user.click(screen.getByRole("button", { name: "Import music" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Folder access denied",
  );
  await user.click(screen.getByRole("button", { name: "Import music" }));
  await waitFor(() => expect(api.importFolders).toHaveBeenCalledTimes(2));
});

it("preserves album actions and local hero artwork", async () => {
  const user = userEvent.setup();
  vi.mocked(api.trackIds).mockResolvedValue([song.id]);
  vi.mocked(api.tracks).mockImplementation(async (query) => ({
    items: query.favourites ? [] : [song],
    total: query.favourites ? 0 : 1,
  }));
  act(() => useMuse.getState().navigate("library"));
  act(() => useMuse.getState().navigate("album", album.id));
  const { container } = render(<App />);
  const query = { albumId: album.id, sort: "album" };
  const page = within(container.querySelector(".album-page")!);
  expect(container.querySelector(".album-panel-art")).toHaveAttribute(
    "src",
    album.cover,
  );
  expect(container.querySelector(".detail-cover img")).toHaveAttribute(
    "src",
    album.cover,
  );
  await user.click(screen.getByRole("button", { name: "Play album" }));
  expect(api.player).toHaveBeenLastCalledWith({ action: "play", query });
  await user.click(page.getByRole("button", { name: "Shuffle" }));
  expect(api.player).toHaveBeenLastCalledWith({
    action: "play",
    query,
    mode: "shuffle",
  });
  await user.click(screen.getByRole("button", { name: "Favourite" }));
  await waitFor(() =>
    expect(api.favourites).toHaveBeenCalledWith([song.id], true),
  );
  await user.click(screen.getByRole("button", { name: "Pin" }));
  await waitFor(() =>
    expect(api.tiles).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ kind: "album", target: album.id }),
      ]),
    ),
  );
  await user.click(
    screen.getAllByRole("button", { name: "Add to playlist" })[0],
  );
  expect(
    await screen.findByRole("dialog", { name: "Add to playlist" }),
  ).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Close dialog" }));
  await user.click(await screen.findByLabelText(`Select ${song.title}`));
  expect(screen.getByLabelText(`Select ${song.title}`)).toBeChecked();
  await user.click(screen.getByRole("button", { name: "Go back" }));
  expect(screen.getByRole("heading", { name: "Your library." })).toBeVisible();
});

it("hides the footer on Now Playing and provides immersive volume and queue controls", async () => {
  const user = userEvent.setup();
  act(() =>
    useMuse.setState({
      page: "now",
      playback: {
        ...emptyPlayback,
        current: song,
        queue: [song.id],
        playing: true,
        shuffle: true,
        repeat: "one",
      },
    }),
  );
  const { container } = render(<App />);
  expect(
    screen.queryByRole("searchbox", { name: "Search music" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: song.title })).toBeVisible();
  expect(container.querySelector(".now-atmosphere-art")).toHaveAttribute(
    "src",
    song.cover,
  );
  expect(
    screen.getAllByRole("group", { name: "Playback controls" }),
  ).toHaveLength(1);
  expect(
    screen.getAllByRole("slider", { name: "Playback position" }),
  ).toHaveLength(1);
  const immersive = within(
    screen.getByRole("article", { name: "Now Playing" }),
  );
  expect(immersive.getByRole("button", { name: "Shuffle" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(
    immersive.getByRole("button", { name: "Repeat: one" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    screen.queryByRole("contentinfo", { name: "Music player" }),
  ).not.toBeInTheDocument();
  const footer = immersive;
  expect(
    footer.getByRole("group", { name: "Playback controls" }),
  ).toBeInTheDocument();
  expect(footer.queryByRole("slider", { name: "Volume" })).not.toBeInTheDocument();
  await user.click(footer.getByRole("button", { name: "Adjust volume" }));
  expect(footer.getByRole("slider", { name: "Volume" })).toBeInTheDocument();
  await user.click(footer.getByRole("button", { name: "Pause" }));
  expect(api.player).toHaveBeenLastCalledWith({ action: "toggle" });
  for (const [name, action] of [
    ["Shuffle", "shuffle"],
    ["Previous track", "previous"],
    ["Next track", "next"],
    ["Repeat: off", "repeat"],
  ]) {
    await user.click(footer.getByRole("button", { name }));
    expect(api.player).toHaveBeenLastCalledWith({ action });
  }
  const queue = screen.getByRole("region", { name: "Playback queue" });
  await user.click(footer.getByRole("button", { name: "Open playback queue" }));
  expect(queue).toHaveFocus();
  await user.click(footer.getByRole("button", { name: "Open playback queue" }));
  expect(queue).toHaveFocus();
  await user.click(screen.getByRole("button", { name: song.artist }));
  expect(
    screen.getByRole("contentinfo", { name: "Music player" }),
  ).toBeVisible();
  expect(useMuse.getState().page).toBe("artist");
  expect(useMuse.getState().context).toBe(song.artist);
  expect(screen.getByRole("searchbox", { name: "Search music" })).toBeVisible();
});

it("opens the queue by scrolling only main content and allows returning to the cover", async () => {
  const user = userEvent.setup();
  render(<App />);
  const content = screen.getByRole("main");
  const scroll = vi.spyOn(content, "scrollTo");
  // Model a viewport below the window top, already partially scrolled.
  content.getBoundingClientRect = () => new DOMRect(130, 40, 900, 600);
  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  const rect = vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: HTMLElement) {
      if (this.id === "playback-queue") return new DOMRect(130, 840, 900, 400);
      return originalRect.call(this);
    });
  content.scrollTop = 200;
  scroll.mockClear();
  try {
    await user.click(
      screen.getByRole("button", { name: "Open playback queue" }),
    );
    expect(scroll).toHaveBeenLastCalledWith(
      expect.objectContaining({ top: 1000 }),
    );
    expect(
      screen.getByRole("region", { name: "Playback queue" }),
    ).toHaveFocus();
    content.scrollTo({ top: 0 });
    expect(content.scrollTop).toBe(0);
    scroll.mockClear();
    await user.click(
      screen.getByRole("button", { name: "Open playback queue" }),
    );
    expect(scroll).toHaveBeenLastCalledWith(
      expect.objectContaining({ top: 800 }),
    );
    expect(
      screen.getByRole("region", { name: "Playback queue" }),
    ).toHaveFocus();
  } finally {
    rect.mockRestore();
    scroll.mockRestore();
  }
});

it("commits pointer and keyboard seeks, resets draft seeks for a new track, and adjusts volume", async () => {
  act(() => useMuse.setState({ page: "now" }));
  render(<App />);
  const footer = within(screen.getByRole("main"));
  let seek = footer.getByRole("slider", { name: "Playback position" });
  fireEvent.change(seek, { target: { value: "90" } });
  expect(seek).toHaveStyle({ "--range-progress": "50%" });
  fireEvent.pointerUp(seek);
  await waitFor(() =>
    expect(api.player).toHaveBeenLastCalledWith({ action: "seek", value: 90 }),
  );
  fireEvent.change(seek, { target: { value: "120" } });
  fireEvent.keyUp(seek, { key: "ArrowRight" });
  await waitFor(() =>
    expect(api.player).toHaveBeenLastCalledWith({ action: "seek", value: 120 }),
  );
  fireEvent.change(seek, { target: { value: "80" } });
  act(() =>
    useMuse.setState((s) => ({
      playback: {
        ...s.playback,
        current: { ...song, id: "next", duration: 300 },
        position: 10,
      },
    })),
  );
  seek = footer.getByRole("slider", { name: "Playback position" });
  expect(seek).toHaveValue("10");
  fireEvent.click(screen.getByRole("button", { name: "Adjust volume" }));
  fireEvent.change(screen.getByRole("slider", { name: "Volume" }), {
    target: { value: "0.25" },
  });
  await waitFor(() =>
    expect(api.player).toHaveBeenLastCalledWith({
      action: "volume",
      value: 0.25,
    }),
  );
});

it("keeps playlist identity and favourite results tied to their original track", async () => {
  const user = userEvent.setup();
  let resolveOld!: (rows: Track[]) => void;
  const next = {
    ...song,
    id: "next-track",
    title: "After the light",
    liked: true,
  };
  vi.mocked(api.getTracks).mockImplementation((ids) =>
    ids[0] === song.id
      ? new Promise((resolve) => {
          resolveOld = resolve;
        })
      : Promise.resolve([next]),
  );
  vi.mocked(api.playlist).mockResolvedValue("new-playlist");
  act(() =>
    useMuse.setState({
      page: "now",
      playback: { ...emptyPlayback, current: song, queue: [] },
    }),
  );
  render(<App />);
  await user.click(screen.getByRole("button", { name: "Add to playlist" }));
  act(() =>
    useMuse.setState((s) => ({ playback: { ...s.playback, current: next } })),
  );
  expect(
    await screen.findByRole("button", { name: "Favourited" }),
  ).toHaveAttribute("aria-pressed", "true");
  await act(async () => resolveOld([{ ...song, liked: false }]));
  expect(screen.getByRole("button", { name: "Favourited" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await user.type(
    screen.getByLabelText("Create a new playlist"),
    "Night listening",
  );
  await user.click(
    screen.getByRole("button", { name: "Create and add tracks" }),
  );
  await waitFor(() =>
    expect(api.playlist).toHaveBeenCalledWith("add", "new-playlist", null, [
      song.id,
    ]),
  );
  await user.click(screen.getByRole("button", { name: "Favourited" }));
  await waitFor(() =>
    expect(api.favourite).toHaveBeenCalledWith(next.id, false),
  );
});

it("handles broken and missing current artwork and retains album navigation", async () => {
  const user = userEvent.setup();
  act(() => useMuse.setState({ page: "now" }));
  const { container } = render(<App />);
  const background = container.querySelector(".now-atmosphere-art")!;
  fireEvent.error(background);
  expect(background).not.toBeVisible();
  fireEvent.error(container.querySelector(".now-artwork img")!);
  expect(container.querySelector(".now-artwork .art-text")).toHaveTextContent(
    song.album,
  );
  act(() =>
    useMuse.setState((s) => ({
      playback: { ...s.playback, current: { ...song, cover: null } },
      library: { ...s.library, albums: [{ ...album, cover: null }] },
    })),
  );
  expect(
    container.querySelector(".now-atmosphere-art"),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: song.album }));
  expect(useMuse.getState().page).toBe("album");
  expect(useMuse.getState().context).toBe(song.albumId);
});

it("updates Now Playing colors with the current cover and falls back to the album cover", async () => {
  const originalImage = globalThis.Image;
  const images: HTMLImageElement[] = [];
  vi.stubGlobal(
    "Image",
    class {
      constructor() {
        const image = document.createElement("img");
        images.push(image);
        return image;
      }
    },
  );
  let pixels = [220, 55, 30, 255];
  const canvas = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue({
      drawImage: vi.fn(),
      getImageData: () => ({ data: pixels }),
    } as unknown as CanvasRenderingContext2D);
  try {
    act(() =>
      useMuse.setState({
        page: "now",
        playback: { ...emptyPlayback, current: { ...song, cover: null } },
        library: {
          ...library,
          albums: [{ ...album, cover: "/cached/warm-palette-test.jpg" }],
        },
      }),
    );
    const { container } = render(<App />);
    expect(container.querySelector(".now-atmosphere-art")).toHaveAttribute(
      "src",
      "/cached/warm-palette-test.jpg",
    );
    await act(async () => {
      images.at(-1)!.dispatchEvent(new Event("load"));
    });
    const shell = container.querySelector<HTMLElement>(".app")!;
    const warm = atmosphereFromPixels(pixels);
    expect(shell.style.getPropertyValue("--muse-accent")).toBe(warm.accent);
    expect(shell.style.getPropertyValue("--muse-on-accent")).toBe(
      warm.onAccent,
    );
    expect(shell.style.getPropertyValue("--now-background")).toBe(
      warm.background,
    );
    act(() =>
      useMuse.setState((s) => ({
        playback: {
          ...s.playback,
          current: {
            ...song,
            id: "cool-track",
            cover: "/cached/cool-palette-test.jpg",
          },
        },
      })),
    );
    pixels = [25, 90, 220, 255];
    await act(async () => {
      images.at(-1)!.dispatchEvent(new Event("load"));
    });
    const cool = atmosphereFromPixels(pixels);
    expect(shell.style.getPropertyValue("--now-background")).toBe(
      cool.background,
    );
    expect(shell.style.getPropertyValue("--now-accent")).toBe(cool.accent);
    expect(shell.style.getPropertyValue("--muse-accent")).toBe(cool.accent);
    expect(container.querySelector(".now-atmosphere-art")).toHaveAttribute(
      "src",
      "/cached/cool-palette-test.jpg",
    );
    act(() => useMuse.getState().navigate("home"));
    expect(shell.style.getPropertyValue("--muse-accent")).toBe(cool.accent);
    expect(
      screen.getByRole("contentinfo", { name: "Music player" }),
    ).toBeVisible();
    expect(cool.background).not.toBe(warm.background);
    act(() => useMuse.setState({ playback: emptyPlayback }));
    expect(shell.style.getPropertyValue("--muse-accent")).toBe(
      defaultAtmosphere.accent,
    );
  } finally {
    canvas.mockRestore();
    vi.stubGlobal("Image", originalImage);
  }
});

it("offers library navigation when Now Playing has no current track", async () => {
  const user = userEvent.setup();
  act(() => useMuse.setState({ page: "now", playback: emptyPlayback }));
  render(<App />);
  expect(
    screen.getByText("Choose something from your library to listen."),
  ).toBeVisible();
  const footer = within(screen.getByRole("main"));
  expect(
    screen.queryByRole("contentinfo", { name: "Music player" }),
  ).not.toBeInTheDocument();
  expect(footer.queryByRole("slider", { name: "Volume" })).not.toBeInTheDocument();
  await user.click(footer.getByRole("button", { name: "Adjust volume" }));
  expect(footer.getByRole("slider", { name: "Volume" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Browse your library" }));
  expect(screen.getByRole("heading", { name: "Your library." })).toBeVisible();
});

it("loads and saves the native close preference without losing it on failure", async () => {
  vi.mocked(api.preferences).mockResolvedValue({
    closeBehavior: "background",
    backgroundAvailable: true,
  });
  vi.mocked(api.setCloseBehavior).mockRejectedValueOnce(
    new Error("disk unavailable"),
  );
  render(<SettingsScreen />);
  const background = screen.getByRole("radio", {
    name: "Keep running in background",
  });
  const quit = screen.getByRole("radio", { name: "Quit Muse" });
  await waitFor(() => expect(background).toBeChecked());
  fireEvent.click(quit);
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("disk unavailable"),
  );
  expect(background).toBeChecked();
  vi.mocked(api.setCloseBehavior).mockResolvedValueOnce();
  fireEvent.click(quit);
  await waitFor(() => expect(quit).toBeChecked());
  expect(api.setCloseBehavior).toHaveBeenLastCalledWith("quit");
});

it("disables background mode when native tray creation failed", async () => {
  vi.mocked(api.preferences).mockResolvedValue({
    closeBehavior: "quit",
    backgroundAvailable: false,
  });
  render(<SettingsScreen />);
  await waitFor(() =>
    expect(screen.getByRole("radio", { name: "Quit Muse" })).toBeEnabled(),
  );
  expect(
    screen.getByRole("radio", { name: "Keep running in background" }),
  ).toBeDisabled();
  expect(screen.getByText(/The system tray is unavailable/)).toBeVisible();
});

it("allows retrying a failed preference load", async () => {
  vi.mocked(api.preferences).mockRejectedValueOnce(
    new Error("storage unavailable"),
  );
  render(<SettingsScreen />);
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("storage unavailable"),
  );
  expect(screen.getByRole("radio", { name: "Quit Muse" })).toBeDisabled();
  vi.mocked(api.preferences).mockResolvedValueOnce({
    closeBehavior: "quit",
    backgroundAvailable: true,
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Retry loading preference" }),
  );
  await waitFor(() =>
    expect(screen.getByRole("radio", { name: "Quit Muse" })).toBeEnabled(),
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("expands artwork across the workspace, closes to the previous route and restores focus", async () => {
  const user = userEvent.setup();
  act(() => useMuse.setState({ page: "library", search: "Ambient" }));
  const { container } = render(<App />);
  const artwork = screen.getByRole("button", { name: "Open Now Playing" });
  expect(artwork.querySelector(".thumb-expand svg")).toBeInTheDocument();
  await user.click(artwork);
  expect(container.querySelector(".sidebar")).not.toBeInTheDocument();
  expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
  const close = screen.getByRole("button", { name: "Close Now Playing" });
  expect(close).toHaveFocus();
  await user.click(close);
  expect(useMuse.getState().page).toBe("library");
  expect(useMuse.getState().search).toBe("Ambient");
  expect(
    screen.getByRole("button", { name: "Open Now Playing" }),
  ).toHaveFocus();
  expect(useMuse.getState().playback.current).toEqual(song);
  expect(api.player).not.toHaveBeenCalled();
});

it("dismisses empty Now Playing with Escape and falls back to Home", async () => {
  const user = userEvent.setup();
  act(() => useMuse.setState({ page: "now", playback: emptyPlayback }));
  const { container } = render(<App />);
  expect(container.querySelector(".sidebar")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Close Now Playing" }),
  ).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(useMuse.getState().page).toBe("home");
  expect(
    screen.getByRole("button", { name: "Open Now Playing" }),
  ).toHaveFocus();
});

it("leaves immersive playback open when Escape belongs to an open dialog", () => {
  act(() => useMuse.setState({ page: "now" }));
  render(<App />);
  const dialog = document.createElement("dialog");
  dialog.setAttribute("open", "");
  document.body.append(dialog);
  fireEvent.keyDown(dialog, { key: "Escape" });
  expect(useMuse.getState().page).toBe("now");
  dialog.remove();
  fireEvent.keyDown(document.body, { key: "Escape" });
  expect(useMuse.getState().page).toBe("home");
});

it("reserves macOS traffic-light space and supplies a transparent drag region", () => {
  const agent = vi
    .spyOn(navigator, "userAgent", "get")
    .mockReturnValue("Macintosh");
  try {
    const { container } = render(<App />);
    expect(container.querySelector(".app")).toHaveClass("app--mac");
    expect(container.querySelector(".window-drag-region")).toHaveAttribute(
      "data-tauri-drag-region",
    );
    act(() => useMuse.getState().navigate("now"));
    expect(container.querySelector(".window-drag-region")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Close Now Playing" }),
    ).toBeVisible();
  } finally {
    agent.mockRestore();
  }
});

it("identifies remote albums and the current remote track without changing player controls", async()=>{
  const remoteSong={...song,id:"sftp:source:track",albumId:"sftp:source:album:one"};
  act(()=>useMuse.setState({page:"library",library:{...emptyLibrary,tracks:1,albums:[{...album,id:remoteSong.albumId}]},playback:{...emptyPlayback,current:remoteSong,queue:[remoteSong.id]}}));
  render(<App/>);
  expect(await screen.findAllByRole("img", {name:"Remote music (SSH)"})).toHaveLength(2);
  expect(screen.queryByText("Remote · SSH")).not.toBeInTheDocument();
  act(()=>useMuse.setState({library:{...emptyLibrary,tracks:1,albums:[album]},playback:{...emptyPlayback,current:song,queue:[song.id]}}));
  expect(screen.queryByRole("img",{name:"Remote music (SSH)"})).not.toBeInTheDocument();
  expect(screen.getByRole("button",{name:"Play"})).toBeEnabled();
  expect(api.player).not.toHaveBeenCalled();
});

it("explains local catalog removal, supports cancel and retries without losing the folder",async()=>{
  const user=userEvent.setup();const source={id:"source-one",path:"/Music/Local",available:true,lastScan:0,error:null};
  act(()=>useMuse.setState({library:{...emptyLibrary,sources:[source]}}));vi.mocked(api.removeFolder).mockRejectedValueOnce("Folder could not be removed.").mockResolvedValue();
  vi.mocked(api.preferences).mockResolvedValue({closeBehavior:"quit",backgroundAvailable:true});
  render(<SettingsScreen/>);await user.click(screen.getByRole("button",{name:"Remove folder /Music/Local"}));
  expect(screen.getByRole("dialog",{name:"Remove this music folder?"})).toHaveTextContent("Songs found only in this folder will be removed");expect(screen.getByText(/Your original music files stay in place/)).toBeVisible();
  await user.click(screen.getByRole("button",{name:"Cancel"}));expect(api.removeFolder).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button",{name:"Remove folder /Music/Local"}));await user.click(screen.getByRole("button",{name:"Remove folder"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Folder could not be removed");expect(screen.getByRole("dialog")).toBeVisible();
  vi.mocked(api.library).mockResolvedValue(emptyLibrary);await user.click(screen.getByRole("button",{name:"Remove folder"}));await waitFor(()=>expect(screen.queryByRole("dialog")).not.toBeInTheDocument());expect(api.removeFolder).toHaveBeenLastCalledWith("source-one");expect(useMuse.getState().library.sources).toHaveLength(0);
});

it("merges Now Playing controls and supports a dismissible volume popup without leaving playback",async()=>{
  const user=userEvent.setup();act(()=>useMuse.setState({page:"now"}));render(<App/>);
  const toolbar=screen.getByRole("group",{name:"Now Playing controls"});
  expect(within(toolbar).getAllByRole("button").map(button=>button.getAttribute("aria-label"))).toEqual(["Adjust volume","Shuffle","Previous track","Play","Next track","Repeat: off","AirPlay / audio output","Open playback queue"]);
  expect(screen.queryByRole("slider",{name:"Volume"})).not.toBeInTheDocument();
  const trigger=within(toolbar).getByRole("button",{name:"Adjust volume"});await user.click(trigger);
  expect(screen.getByRole("dialog",{name:"Volume controls"})).toBeVisible();expect(screen.getByRole("slider",{name:"Volume"})).toHaveFocus();
  fireEvent.change(screen.getByRole("slider",{name:"Volume"}),{target:{value:"0.2"}});
  await user.keyboard("{Escape}");expect(screen.queryByRole("dialog",{name:"Volume controls"})).not.toBeInTheDocument();expect(trigger).toHaveFocus();expect(useMuse.getState().page).toBe("now");
  await waitFor(()=>expect(api.player).toHaveBeenCalledWith({action:"volume",value:0.2}));
  await user.click(trigger);await user.click(screen.getByRole("button",{name:"Mute"}));expect(api.player).toHaveBeenLastCalledWith({action:"volume",value:0});
  await user.click(screen.getByRole("heading",{level:1}));expect(screen.queryByRole("dialog",{name:"Volume controls"})).not.toBeInTheDocument();expect(useMuse.getState().page).toBe("now");
});

it("keeps the volume popup interactive through native range focus changes until an outside click",async()=>{
  const user=userEvent.setup();act(()=>useMuse.setState({page:"now"}));render(<App/>);
  await user.click(screen.getByRole("button",{name:"Adjust volume"}));const slider=screen.getByRole("slider",{name:"Volume"});
  fireEvent.pointerDown(slider);fireEvent.change(slider,{target:{value:"0.35"}});
  fireEvent.blur(slider,{relatedTarget:document.body});
  expect(screen.getByRole("dialog",{name:"Volume controls"})).toBeVisible();
  fireEvent.pointerUp(slider);await user.click(screen.getByRole("button",{name:"Mute"}));
  expect(screen.getByRole("dialog",{name:"Volume controls"})).toBeVisible();
  await user.click(screen.getByRole("heading",{level:1}));expect(screen.queryByRole("dialog",{name:"Volume controls"})).not.toBeInTheDocument();
});

it("switches to lyrics without replacing playback and supports keyboard tabs", async () => {
  vi.mocked(api.lyrics).mockResolvedValue(null);
  act(()=>useMuse.setState({page:"now",playback:{...emptyPlayback,current:song,queue:[song.id]}}));
  const user=userEvent.setup(); render(<App/>);
  expect(api.lyrics).not.toHaveBeenCalled();
  expect(screen.getAllByRole("tab").map(tab=>tab.textContent)).toEqual(["NOW PLAYING","LYRICS","VISUAL EFFECTS"]);
  const lyrics=screen.getByRole("tab",{name:"LYRICS"});
  await user.click(lyrics);
  expect(await screen.findByText(/Lyrics aren’t available/)).toBeVisible();
  expect(api.lyrics).toHaveBeenCalledWith(song.id);
  expect(screen.queryByRole("heading",{name:song.title})).not.toBeInTheDocument();
  expect(screen.getByRole("slider",{name:"Playback position"})).toBeVisible();
  await user.keyboard("{ArrowLeft}");
  expect(screen.getByRole("tab",{name:"NOW PLAYING"})).toHaveFocus();
  expect(screen.getByRole("heading",{name:song.title})).toBeVisible();
});

it("shows artist albums above songs and opens an album from the artist collection", async()=>{
  vi.mocked(api.artistAlbumIds).mockResolvedValue([album.id]);
  act(()=>useMuse.setState({page:"artist",context:song.artist}));
  const user=userEvent.setup();render(<App/>);
  const albums=screen.getByRole("region",{name:`${song.artist} albums`});
  const cover=await within(albums).findByRole("button",{name:new RegExp(album.title)});
  expect(api.artistAlbumIds).toHaveBeenCalledWith(song.artist);
  expect(screen.getByRole("heading",{name:"Songs"})).toBeVisible();
  await user.click(cover);
  expect(useMuse.getState().page).toBe("album");expect(useMuse.getState().context).toBe(album.id);
});

it("provides an explicit native fullscreen exit without relying on Escape",async()=>{
 vi.mocked(api.windowFullscreen).mockResolvedValue(true);
 const user=userEvent.setup();render(<App/>);
 await user.click(await screen.findByRole("button",{name:"Exit fullscreen"}));
 expect(api.exitFullscreen).toHaveBeenCalledOnce();
});

it("keeps native fullscreen exit and Now Playing close in one window-controls row",async()=>{
 vi.mocked(api.windowFullscreen).mockResolvedValue(true);
 act(()=>useMuse.setState({page:"now"}));render(<App/>);
 await screen.findByRole("button",{name:"Exit fullscreen"});
 const controls=screen.getByRole("group",{name:"Window controls"});
 expect(controls).toContainElement(screen.getByRole("button",{name:"Exit fullscreen"}));
 expect(controls).toContainElement(screen.getByRole("button",{name:"Close Now Playing"}));
});

it('expands visuals with outer gutters while other Now Playing tabs retain their album artwork',async()=>{
 vi.mocked(api.visualizerActive).mockResolvedValue();vi.mocked(api.visualizerFrame).mockResolvedValue({trackId:song.id,epoch:1,sequence:0,available:false,playing:false,bands:[],waveform:[],rms:0,bass:0,mids:0,treble:0});
 const context=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
 try{
  act(()=>useMuse.setState({page:'now',playback:{...emptyPlayback,current:song,queue:[song.id]}}));const user=userEvent.setup();const {container}=render(<App/>);await user.click(screen.getByRole('tab',{name:'VISUAL EFFECTS'}));await user.click(screen.getByRole('button',{name:'Expand visual width'}));expect(container.querySelector('.now-page')).toHaveClass('now-page--visual-wide');expect(container.querySelector('.now-artwork')).toHaveAttribute('hidden');expect(screen.getByRole('slider',{name:'Playback position'})).toBeVisible();
  await user.click(screen.getByRole('tab',{name:'NOW PLAYING'}));expect(container.querySelector('.now-page')).not.toHaveClass('now-page--visual-wide');expect(container.querySelector('.now-artwork')).not.toHaveAttribute('hidden');
  await user.click(screen.getByRole('tab',{name:'VISUAL EFFECTS'}));expect(container.querySelector('.now-page')).toHaveClass('now-page--visual-wide');await user.click(screen.getByRole('button',{name:'Restore visual width'}));expect(container.querySelector('.now-artwork')).not.toHaveAttribute('hidden');
 }finally{context.mockRestore();}
});
