import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { providers, providerMessage, type PlexState } from "../providers";
import { PlexScreen } from "./plex";
import { App } from "./app";
import { useMuse } from "../store";
import { emptyLibrary, emptyPlayback, type Track } from "../types";
import { api } from "../native";

vi.mock("@tauri-apps/api/event",()=>({listen:async()=>()=>{}}));
vi.mock("../providers", async (importOriginal) => {
  const original = await importOriginal<typeof import("../providers")>();
  return {
    ...original,
    providers: Object.fromEntries(
      Object.keys(original.providers).map((key) => [key, vi.fn()]),
    ),
  };
});
vi.mock("../native", () => ({
  native: true,
  artwork: (p: string) => p,
  api: {
    windowFullscreen: vi.fn(),
    player: vi.fn(),
    getTracks: vi.fn(),
    tracks: vi.fn(),
    preferences: vi.fn(),
  },
}));
const disconnected: PlexState = {
  accountConnected: false,
  status: "disconnected",
  selection: null,
  servers: [],
  libraries: [],
};
const serverState: PlexState = {
  ...disconnected,
  status: "choose_library",
  selection: {
    serverId: "server-a",
    serverName: "Living room",
    url: "https://plex.example.test:32400",
    allowLocalHttp: false,
    library: null,
    account: false,
  },
  libraries: [{ id: "4", title: "Music" }],
};
const connected: PlexState = {
  ...serverState,
  status: "connected",
  selection: {
    ...serverState.selection!,
    library: { id: "4", title: "Music" },
  },
};
const song: Track = {
  id: "local-song",
  title: "Local track",
  artist: "Local artist",
  album: "Local album",
  albumArtist: "Local artist",
  albumId: "local-album",
  year: 2026,
  genre: "Jazz",
  duration: 180,
  trackNo: 1,
  discNo: 1,
  cover: null,
  liked: false,
  available: true,
  addedAt: 1,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.windowFullscreen).mockResolvedValue(false);
  vi.mocked(providers.state).mockResolvedValue(disconnected);
  vi.mocked(providers.cancelAuth).mockResolvedValue();
  vi.mocked(providers.openAuth).mockResolvedValue();
  vi.mocked(providers.disconnect).mockResolvedValue(disconnected);
  act(() =>
    useMuse.setState({
      page: "home",
      context: "",
      navigationHistory: [],
      library: emptyLibrary,
      playback: { ...emptyPlayback, current: song, queue: [song.id] },
      loading: false,
      error: null,
      notice: null,
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("selects Plex without replacing the local catalog or player", async () => {
  const user = userEvent.setup();
  render(<App />);
  const local = useMuse.getState().library;
  const playback = useMuse.getState().playback;
  expect(
    screen.queryByRole("button", { name: "Plex" }),
  ).not.toBeInTheDocument();
  act(() => useMuse.getState().navigate("plex"));
  expect(await screen.findByRole("heading", { name: "Plex." })).toBeVisible();
  expect(await screen.findByText("Not connected")).toBeVisible();
  expect(
    screen.getByRole("contentinfo", { name: "Music player" }),
  ).toBeVisible();
  expect(useMuse.getState().library).toBe(local);
  expect(useMuse.getState().playback).toBe(playback);
  expect(api.player).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("button", { name: "Return to local music" }),
  );
  expect(useMuse.getState().page).toBe("library");
  expect(useMuse.getState().playback).toBe(playback);
});
it("connects manually, clears the password input and selects only a discovered music library", async () => {
  const user = userEvent.setup();
  vi.mocked(providers.manual).mockResolvedValue(serverState);
  vi.mocked(providers.selectLibrary).mockResolvedValue(connected);
  render(<PlexScreen />);
  await screen.findByText("Not connected");
  const input = screen.getByLabelText("Plex token");
  expect(input).toHaveAttribute("type", "password");
  await user.type(
    screen.getByLabelText("Server URL"),
    "https://plex.example.test:32400",
  );
  await user.type(input, "synthetic-secret");
  await user.click(screen.getByRole("button", { name: "Connect manually" }));
  expect(providers.manual).toHaveBeenCalledWith(
    "https://plex.example.test:32400",
    "synthetic-secret",
    false,
  );
  expect(input).toHaveValue("");
  expect(document.body.textContent).not.toContain("synthetic-secret");
  await user.selectOptions(screen.getByLabelText("Library"), "4");
  await user.click(screen.getByRole("button", { name: "Use music library" }));
  expect(providers.selectLibrary).toHaveBeenCalledWith("4");
  expect(await screen.findByText("Connected")).toBeVisible();
  expect(api.player).not.toHaveBeenCalled();
});
it("retains the server URL and gives safe retry feedback on a connectivity failure", async () => {
  const user = userEvent.setup();
  vi.mocked(providers.manual).mockRejectedValue({
    code: "unreachable",
    message: "unsafe detail synthetic-secret",
  });
  render(<PlexScreen />);
  await screen.findByText("Not connected");
  await user.type(
    screen.getByLabelText("Server URL"),
    "http://127.0.0.1:32400",
  );
  await user.type(screen.getByLabelText("Plex token"), "synthetic-secret");
  await user.click(
    screen.getByLabelText("Allow HTTP for a local development server"),
  );
  await user.click(screen.getByRole("button", { name: "Connect manually" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not reach Plex",
  );
  expect(screen.getByRole("alert")).toHaveFocus();
  expect(screen.getByLabelText("Server URL")).toHaveValue(
    "http://127.0.0.1:32400",
  );
  expect(screen.getByLabelText("Plex token")).toHaveValue("");
  expect(document.body.textContent).not.toContain("synthetic-secret");
  expect(providers.manual).toHaveBeenCalledWith(
    "http://127.0.0.1:32400",
    "synthetic-secret",
    true,
  );
});
it("opens native account sign-in, polls, discovers servers and permits explicit selection", async () => {
  vi.useFakeTimers();
  vi.mocked(providers.beginAuth).mockResolvedValue({
    id: 11,
    url: "https://app.plex.tv/auth#?code=pin",
    expiresAt: Date.now() / 1000 + 300,
  });
  const signedIn = { ...disconnected, accountConnected: true };
  vi.mocked(providers.pollAuth).mockResolvedValue({
    complete: true,
    state: signedIn,
  });
  vi.mocked(providers.discover).mockResolvedValue({
    ...signedIn,
    servers: [{ id: "server-a", name: "Living room", connections: 1 }],
  });
  vi.mocked(providers.selectServer).mockResolvedValue({
    ...serverState,
    accountConnected: true,
  });
  render(<PlexScreen />);
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "Sign in with Plex" }));
  await act(async () => {});
  expect(providers.openAuth).toHaveBeenCalledWith(11);
  expect(
    screen.getByText("Complete sign-in in your browser, then return to Muse."),
  ).toBeVisible();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(providers.pollAuth).toHaveBeenCalledWith(11);
  expect(providers.discover).toHaveBeenCalledOnce();
  fireEvent.change(screen.getByLabelText("Server"), {
    target: { value: "server-a" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Connect server" }));
  await act(async () => {});
  expect(providers.selectServer).toHaveBeenCalledWith("server-a", false);
  expect(screen.getByLabelText("Library")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Cancel sign-in" }),
  ).not.toBeInTheDocument();
});
it("cancels sign-in on navigation and ignores late polling results", async () => {
  vi.useFakeTimers();
  vi.mocked(providers.beginAuth).mockResolvedValue({
    id: 15,
    url: "https://app.plex.tv/auth#?code=pin",
    expiresAt: Date.now() / 1000 + 300,
  });
  let finish!: (value: { complete: boolean; state: PlexState }) => void;
  vi.mocked(providers.pollAuth).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const { unmount } = render(<PlexScreen />);
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "Sign in with Plex" }));
  await act(async () => {});
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  unmount();
  expect(providers.cancelAuth).toHaveBeenCalledWith(15);
  await act(async () => {
    finish({
      complete: true,
      state: { ...disconnected, accountConnected: true },
    });
  });
  expect(providers.discover).not.toHaveBeenCalled();
});
it("supports saved-credential reconnect, metadata checks and disconnection", async () => {
  const user = userEvent.setup();
  vi.mocked(providers.state).mockResolvedValue({
    ...connected,
    status: "configured",
  });
  vi.mocked(providers.reconnect).mockResolvedValue(connected);
  vi.mocked(providers.test).mockResolvedValue(connected);
  vi.mocked(providers.verifyMetadata).mockResolvedValue({
    artists: { providerId: "plex", offset: 0, total: 2, items: [] },
    albums: { providerId: "plex", offset: 0, total: 3, items: [] },
    tracks: { providerId: "plex", offset: 0, total: 12, items: [] },
  });
  render(<PlexScreen />);
  await screen.findByText("Saved connection · reconnect to check");
  await user.click(screen.getByRole("button", { name: "Reconnect" }));
  expect(await screen.findByText("Connected")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Test connection" }));
  expect(await screen.findByText("Connection test passed.")).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: "Verify library metadata" }),
  );
  expect(
    await screen.findByText("2 artists · 3 albums · 12 tracks"),
  ).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Disconnect Plex" }));
  expect(await screen.findByText("Not connected")).toBeVisible();
  expect(
    screen.queryByText("2 artists · 3 albums · 12 tracks"),
  ).not.toBeInTheDocument();
  expect(useMuse.getState().playback.current?.id).toBe(song.id);
  expect(api.player).not.toHaveBeenCalled();
  expect(
    providerMessage({ code: "sign_in_expired", message: "secret" }),
  ).toContain("expired");
  expect(providerMessage("token=secret")).not.toContain("secret");
});
it("offers recovery when credential storage is locked and blocks duplicate connection submits", async () => {
  const user = userEvent.setup();
  vi.mocked(providers.state)
    .mockRejectedValueOnce({ code: "credential_store" })
    .mockResolvedValue(disconnected);
  render(<PlexScreen />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Unlock your system credential store",
  );
  expect(
    screen.getByRole("button", { name: "Connect manually" }),
  ).toBeDisabled();
  await user.click(
    screen.getByRole("button", { name: "Retry connection settings" }),
  );
  expect(await screen.findByText("Not connected")).toBeVisible();
  let resolve!: (state: PlexState) => void;
  vi.mocked(providers.manual).mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  await user.type(
    screen.getByLabelText("Server URL"),
    "https://plex.example.test",
  );
  await user.type(screen.getByLabelText("Plex token"), "synthetic-secret");
  await user.click(screen.getByRole("button", { name: "Connect manually" }));
  expect(
    screen.getByRole("button", { name: "Connect manually" }),
  ).toBeDisabled();
  expect(providers.manual).toHaveBeenCalledOnce();
  await act(async () => {
    resolve(serverState);
  });
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Connect manually" }),
    ).toBeEnabled(),
  );
});

it("shows expired sign-in feedback and enables a fresh sign-in", async () => {
  vi.useFakeTimers();
  vi.mocked(providers.beginAuth).mockResolvedValue({
    id: 19,
    url: "https://app.plex.tv/auth#?code=pin",
    expiresAt: Date.now() / 1000 + 1,
  });
  vi.mocked(providers.pollAuth).mockRejectedValue({
    code: "sign_in_expired",
    message: "never echo raw data",
  });
  render(<PlexScreen />);
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "Sign in with Plex" }));
  await act(async () => {});
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(screen.getByRole("alert")).toHaveTextContent("sign-in expired");
  expect(
    screen.getByRole("button", { name: "Sign in with Plex" }),
  ).toBeEnabled();
  expect(
    screen.queryByRole("button", { name: "Cancel sign-in" }),
  ).not.toBeInTheDocument();
});
