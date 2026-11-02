import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { api, native } from "./native";
import { emptyLibrary, emptyPlayback } from "./types";
import type {
  Library,
  Page,
  Playback,
  PlayerRequest,
  ScanProgress,
  Tile,
} from "./types";

interface MuseState {
  library: Library;
  playback: Playback;
  scan: ScanProgress;
  page: Page;
  context: string;
  search: string;
  loading: boolean;
  error: string | null;
  notice: string | null;
  revision: number;
  importing: boolean;
  libraryView: { tab: string; sort: string };
  setLibraryView: (view: Partial<{ tab: string; sort: string }>) => void;
  navigate: (page: Page, context?: string) => void;
  navigationHistory: { page: Page; context: string; search: string }[];
  goBack: () => void;
  setSearch: (value: string) => void;
  refresh: () => Promise<void>;
  control: (request: PlayerRequest) => Promise<void>;
  importFolders: () => Promise<void>;
  saveTiles: (tiles: Tile[]) => Promise<void>;
  fail: (e: unknown) => void;
  clearError: () => void;
}
function message(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
export const useMuse = create<MuseState>((set, get) => ({
  library: emptyLibrary,
  playback: emptyPlayback,
  scan: {
    running: false,
    scanned: 0,
    changed: 0,
    errors: 0,
    current: "",
    message: "",
  },
  page: "home",
  context: "",
  search: "",
  loading: true,
  error: null,
  notice: null,
  revision: 0,
  importing: false,
  libraryView: { tab: "albums", sort: "title" },
  setLibraryView: (view) =>
    set((state) => ({ libraryView: { ...state.libraryView, ...view } })),
  navigationHistory: [],
  navigate: (page, context = "") =>
    set((state) => ({
      page,
      context,
      search: "",
      navigationHistory:
        state.page === page && state.context === context && !state.search
          ? state.navigationHistory
          : [
              ...state.navigationHistory,
              {
                page: state.page,
                context: state.context,
                search: state.search,
              },
            ].slice(-100),
    })),
  goBack: () =>
    set((state) => {
      const previous = state.navigationHistory.at(-1);
      return previous
        ? {
            ...previous,
            navigationHistory: state.navigationHistory.slice(0, -1),
          }
        : {};
    }),
  setSearch: (search) =>
    set({
      search,
      navigationHistory:
        search.trim() && get().page !== "songs"
          ? [
              ...get().navigationHistory,
              {
                page: get().page,
                context: get().context,
                search: get().search,
              },
            ].slice(-100)
          : get().navigationHistory,
      page: search.trim() ? "songs" : get().page,
      context: search.trim() ? "" : get().context,
    }),
  refresh: async () => {
    try {
      const library = await api.library();
      set((s) => ({ library, revision: s.revision + 1, error: null }));
    } catch (e) {
      get().fail(e);
    }
  },
  control: async (request) => {
    try {
      set({ playback: await api.player(request) });
    } catch (e) {
      get().fail(e);
    }
  },
  importFolders: async () => {
    if (get().importing) return;
    if (!native) {
      set({
        error: "Launch the Muse desktop app to select local music folders.",
      });
      return;
    }
    set({ importing: true, error: null });
    try {
      if (await api.importFolders()) {
        await get().refresh();
        set({
          notice:
            "Indexing your folders in the background. Your music will appear as it is read.",
        });
      }
    } catch (e) {
      get().fail(e);
    } finally {
      set({ importing: false });
    }
  },
  saveTiles: async (tiles) => {
    try {
      await api.tiles(tiles);
      set((s) => ({ library: { ...s.library, tiles } }));
    } catch (e) {
      get().fail(e);
    }
  },
  fail: (e) => set({ error: message(e) }),
  clearError: () => set({ error: null, notice: null }),
}));

let initialized = false;
export async function initialize() {
  if (initialized) return;
  initialized = true;
  if (!native) {
    useMuse.setState({
      loading: false,
      error:
        "Muse uses native audio and filesystem access. Run the desktop app with npm run desktop.",
    });
    return;
  }
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  await listen<Playback>("playback-changed", (event) =>
    useMuse.setState({
      playback: event.payload,
      ...(event.payload.error ? { error: event.payload.error } : {}),
    }),
  );
  await listen<Partial<Playback>>("playback-tick", (event) =>
    useMuse.setState((s) => ({
      playback: { ...s.playback, ...event.payload },
    })),
  );
  await listen<ScanProgress>("scan-progress", (event) =>
    useMuse.setState({ scan: event.payload }),
  );
  await listen("library-changed", () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => void useMuse.getState().refresh(), 150);
  });
  await listen("history-changed", () => {
    void api
      .library()
      .then((library) => useMuse.setState({ library }))
      .catch((e) => useMuse.getState().fail(e));
  });
  try {
    const data = await api.bootstrap();
    useMuse.setState({ ...data, loading: false });
  } catch (e) {
    useMuse.setState({ loading: false });
    useMuse.getState().fail(e);
  }
}
