import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  sftp,
  sftpMessage,
  type SftpState,
  type SftpConfig,
  type HostChallenge,
} from "../sftp";
import { SftpScreen } from "./sftp";
import { App } from "./app";
import { useMuse } from "../store";
import { api } from "../native";
import { emptyLibrary, emptyPlayback } from "../types";
vi.mock("@tauri-apps/api/event",()=>({listen:async()=>()=>{}}));
vi.mock("../sftp", async (importOriginal) => {
  const original = await importOriginal<typeof import("../sftp")>();
  return {
    ...original,
    sftp: Object.fromEntries(
      Object.keys(original.sftp).map((key) => [key, vi.fn()]),
    ),
  };
});
vi.mock("../native", () => ({
  native: true,
  artwork: (p: string) => p,
  api: { windowFullscreen: vi.fn(), player: vi.fn(), getTracks: vi.fn(), preferences: vi.fn() },
}));
const config: SftpConfig = {
  host: "music.example.test",
  port: 2222,
  username: "listener",
  root: "/media/Music",
  identityFile: null,
};
const initial: SftpState = {
  profile: null,
  status: "disconnected",
  listing: null,
  trustedKey: null,
  keyMismatch: null,
};
const serverKey = {
  algorithm: "ssh-ed25519",
  fingerprint: "SHA256:synthetic-test-fingerprint",
};
const challenge: HostChallenge = {
  id: "pending-1",
  host: config.host,
  port: config.port,
  key: serverKey,
  expiresAt: 9999999999,
};
const connected: SftpState = {
  ...initial,
  profile: config,
  status: "connected",
  trustedKey: serverKey,
  listing: {
    root: config.root,
    relative: "",
    parent: null,
    entries: [
      { name: "Album", kind: "directory", size: null },
      { name: "Track.flac", kind: "file", size: 12345 },
      { name: "Linked", kind: "symlink", size: null },
    ],
    truncated: false,
  },
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.windowFullscreen).mockResolvedValue(false);
  vi.mocked(sftp.state).mockResolvedValue(initial);
  vi.mocked(sftp.autoSync).mockResolvedValue({enabled:false,intervalMinutes:15});
  vi.mocked(sftp.saveAutoSync).mockImplementation(async value=>value);
  vi.mocked(sftp.syncStatus).mockResolvedValue({running:false,scanned:0,indexed:0,skipped:0,message:"",error:null,completedAt:null});
  vi.mocked(sftp.cancelHost).mockResolvedValue();
  vi.mocked(sftp.disconnect).mockResolvedValue(initial);
  vi.mocked(sftp.confirmHost).mockResolvedValue(connected);
  act(() =>
    useMuse.setState({
      page: "home",
      context: "",
      loading: false,
      library: emptyLibrary,
      playback: emptyPlayback,
      navigationHistory: [],
      error: null,
      notice: null,
    }),
  );
});
afterEach(cleanup);
async function form(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText("Not connected");
  await user.type(screen.getByLabelText("Host"), config.host);
  await user.clear(screen.getByLabelText("SSH port"));
  await user.type(screen.getByLabelText("SSH port"), "2222");
  await user.type(screen.getByLabelText("Username"), config.username);
  await user.clear(screen.getByLabelText("Remote folder"));
  await user.type(screen.getByLabelText("Remote folder"), config.root);
}
it("keeps SSH inside Settings while preserving the existing player and local data", async () => {
  const user = userEvent.setup();
  render(<App />);
  const local = useMuse.getState().library;
  const player = useMuse.getState().playback;
  expect(
    screen.queryByRole("button", { name: "Plex" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("button", {name:"SSH / SFTP"})).not.toBeInTheDocument();
  vi.mocked(api.preferences).mockResolvedValue({closeBehavior:"quit",backgroundAvailable:true});
  await user.click(screen.getByRole("button", {name:"Settings"}));
  expect(await screen.findByRole("heading",{name:"Settings."})).toBeVisible();
  await user.click(screen.getByRole("button", {name:"Manage SSH / SFTP"}));
  expect(
    await screen.findByRole("heading", { name: "SSH / SFTP." }),
  ).toBeVisible();
  expect(
    screen.getByRole("contentinfo", { name: "Music player" }),
  ).toBeVisible();
  expect(useMuse.getState().library).toBe(local);
  expect(useMuse.getState().playback).toBe(player);
  expect(api.player).not.toHaveBeenCalled();
});
it("requires explicit fingerprint verification before confirming SSH authentication", async () => {
  const user = userEvent.setup();
  vi.mocked(sftp.connect).mockResolvedValue({ state: initial, challenge });
  render(<SftpScreen />);
  await form(user);
  await user.click(screen.getByRole("button", { name: "Connect SSH" }));
  expect(sftp.connect).toHaveBeenCalledWith(config);
  expect(
    await screen.findByRole("dialog", { name: "Verify server key" }),
  ).toBeVisible();
  expect(screen.getByText(serverKey.fingerprint)).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Trust and connect" }),
  ).toBeDisabled();
  expect(sftp.confirmHost).not.toHaveBeenCalled();
  await user.click(
    screen.getByLabelText("I verified this fingerprint with the server owner"),
  );
  await user.click(screen.getByRole("button", { name: "Trust and connect" }));
  expect(sftp.confirmHost).toHaveBeenCalledWith(challenge.id);
  expect(await screen.findByText("Connected")).toBeVisible();
  expect(
    screen.getByRole("table", { name: "Remote music files" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Open Track.flac" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText("Link · not followed")).toBeVisible();
});
it("cancels pending trust on dismissal and unmount", async () => {
  const user = userEvent.setup();
  vi.mocked(sftp.connect).mockResolvedValue({ state: initial, challenge });
  const { unmount } = render(<SftpScreen />);
  await form(user);
  await user.click(screen.getByRole("button", { name: "Connect SSH" }));
  await user.click(await screen.findByRole("button", { name: "Cancel" }));
  expect(sftp.cancelHost).toHaveBeenCalledWith(challenge.id);
  expect(sftp.confirmHost).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Connect SSH" }));
  await screen.findByRole("dialog", { name: "Verify server key" });
  unmount();
  expect(sftp.cancelHost).toHaveBeenCalledTimes(2);
});
it("opens subfolders, selects a music root and reconnects without changing local playback", async () => {
  const user = userEvent.setup();
  vi.mocked(sftp.state).mockResolvedValue(connected);
  const child = {
    ...connected,
    listing: { ...connected.listing!, relative: "Album", parent: "" },
  };
  vi.mocked(sftp.browse).mockResolvedValue(child);
  const selected = {
    ...connected,
    profile: { ...config, root: "/media/Music/Album" },
    listing: { ...connected.listing!, root: "/media/Music/Album" },
  };
  vi.mocked(sftp.chooseFolder).mockResolvedValue(selected);
  vi.mocked(sftp.reconnect).mockResolvedValue({
    state: selected,
    challenge: null,
  });
  render(<SftpScreen />);
  await screen.findByText("Connected");
  await user.click(screen.getByRole("button", { name: "Open Album" }));
  expect(sftp.browse).toHaveBeenCalledWith("Album");
  await user.click(
    screen.getByRole("button", { name: "Use this music folder" }),
  );
  expect(sftp.chooseFolder).toHaveBeenCalledWith("Album");
  expect(await screen.findByText("Remote music folder saved.")).toBeVisible();
  expect(screen.getByLabelText("Remote folder")).toHaveValue(
    "/media/Music/Album",
  );
  await user.click(screen.getByRole("button", { name: "Reconnect" }));
  expect(sftp.reconnect).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: "Disconnect SSH" }));
  expect(await screen.findByText("Not connected")).toBeVisible();
  expect(api.player).not.toHaveBeenCalled();
});
it("uses a native-selected key path and never collects private key contents or passphrases", async () => {
  const user = userEvent.setup();
  vi.mocked(sftp.pickKey).mockResolvedValue("/synthetic/id_ed25519");
  vi.mocked(sftp.connect).mockResolvedValue({ state: initial, challenge });
  render(<SftpScreen />);
  await form(user);
  await user.selectOptions(screen.getByLabelText("SSH key"), "file");
  expect(screen.getByRole("button", { name: "Connect SSH" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Choose private key" }));
  expect(await screen.findByText("/synthetic/id_ed25519")).toBeVisible();
  expect(screen.queryByLabelText(/passphrase/i)).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Connect SSH" }));
  expect(sftp.connect).toHaveBeenCalledWith({
    ...config,
    identityFile: "/synthetic/id_ed25519",
  });
});
it("keeps form values and focuses safe feedback when connectivity fails", async () => {
  const user = userEvent.setup();
  vi.mocked(sftp.connect).mockRejectedValue({
    code: "unreachable",
    message: "do not display raw key secret",
  });
  render(<SftpScreen />);
  await form(user);
  await user.click(screen.getByRole("button", { name: "Connect SSH" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not reach the server",
  );
  expect(screen.getByRole("alert")).toHaveFocus();
  expect(screen.getByLabelText("Host")).toHaveValue(config.host);
  expect(document.body.textContent).not.toContain("raw key secret");
  expect(sftpMessage({ code: "authentication" })).toContain(
    "public key is authorized",
  );
});
it("rejects changed host keys and requires review before forgetting saved trust", async () => {
  const user = userEvent.setup();
  const mismatch = {
    host: config.host,
    port: config.port,
    expected: serverKey,
    observed: { ...serverKey, fingerprint: "SHA256:changed-key" },
  };
  vi.mocked(sftp.state).mockResolvedValue({
    ...connected,
    status: "error",
    keyMismatch: mismatch,
  });
  vi.mocked(sftp.forgetHost).mockResolvedValue({
    ...connected,
    status: "configured",
    trustedKey: null,
    listing: null,
    keyMismatch: null,
  });
  render(<SftpScreen />);
  await screen.findByText("Connection needs attention");
  await user.click(
    screen.getByRole("button", { name: "Review changed server key" }),
  );
  expect(screen.getByText("SHA256:changed-key")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Forget old server key" }),
  ).toBeDisabled();
  await user.click(
    screen.getByLabelText(
      "I verified the new fingerprint with the server owner",
    ),
  );
  await user.click(
    screen.getByRole("button", { name: "Forget old server key" }),
  );
  expect(sftp.forgetHost).toHaveBeenCalledWith(
    config.host,
    config.port,
    serverKey.fingerprint,
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(sftp.confirmHost).not.toHaveBeenCalled();
});

it("makes trust-reset failures visible outside the modal without changing trust automatically", async () => {
  const user = userEvent.setup();
  const mismatch = {
    host: config.host,
    port: config.port,
    expected: serverKey,
    observed: { ...serverKey, fingerprint: "SHA256:changed-key" },
  };
  vi.mocked(sftp.state).mockResolvedValue({
    ...connected,
    status: "error",
    keyMismatch: mismatch,
  });
  vi.mocked(sftp.forgetHost).mockRejectedValue({
    code: "storage",
    message: "private error",
  });
  render(<SftpScreen />);
  await screen.findByText("Connection needs attention");
  await user.click(
    screen.getByRole("button", { name: "Review changed server key" }),
  );
  await user.click(
    screen.getByLabelText(
      "I verified the new fingerprint with the server owner",
    ),
  );
  await user.click(
    screen.getByRole("button", { name: "Forget old server key" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not read or save the SSH connection",
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveFocus();
  expect(sftp.confirmHost).not.toHaveBeenCalled();
});

it("syncs only the catalog, exposes cancellation, and keeps the existing player untouched", async () => {
  vi.mocked(sftp.state).mockResolvedValue(connected);
  const progress = {running:true,scanned:3,indexed:3,skipped:0,message:"Reading remote metadata",error:null,completedAt:null};
  vi.mocked(sftp.syncStart).mockResolvedValue(progress);
  vi.mocked(sftp.syncCancel).mockResolvedValue();
  const user=userEvent.setup(); render(<SftpScreen/>);
  await screen.findByText("Connected");
  expect(screen.getByText(/Only metadata and artwork are saved here/)).toBeVisible();
  await user.click(screen.getByRole("button",{name:"Sync catalog"}));
  expect(sftp.syncStart).toHaveBeenCalledOnce();
  expect(await screen.findByRole("progressbar",{name:"Syncing remote catalog"})).toBeVisible();
  expect(screen.getByRole("button",{name:"Use this music folder"})).toBeDisabled();
  await user.click(screen.getByRole("button",{name:"Cancel Sync"}));
  expect(sftp.syncCancel).toHaveBeenCalledOnce();expect(api.player).not.toHaveBeenCalled();
});
it("shows a retryable Sync failure without losing the selected folder",async()=>{
  vi.mocked(sftp.state).mockResolvedValue(connected);
  vi.mocked(sftp.syncStart).mockRejectedValue("Remote connection interrupted. Reconnect and retry.");
  const user=userEvent.setup();render(<SftpScreen/>);await screen.findByText("Connected");
  await user.click(screen.getByRole("button",{name:"Sync catalog"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Reconnect and retry");
  expect(screen.getByLabelText("Remote folder")).toHaveValue(config.root);
  expect(screen.getByRole("button",{name:"Sync catalog"})).toBeEnabled();
});

it("persists automatic SSH sync settings and offers retry after save failure",async()=>{
 const user=userEvent.setup();render(<SftpScreen/>);
 const toggle=await screen.findByRole('checkbox',{name:'Sync automatically'});
 await waitFor(()=>expect(toggle).toBeEnabled());await user.click(toggle);
 await waitFor(()=>expect(sftp.saveAutoSync).toHaveBeenCalledWith({enabled:true,intervalMinutes:15}));
 await user.selectOptions(screen.getByRole('combobox',{name:'Automatic sync interval'}),'30');
 await waitFor(()=>expect(sftp.saveAutoSync).toHaveBeenLastCalledWith({enabled:true,intervalMinutes:30}));
 vi.mocked(sftp.saveAutoSync).mockRejectedValueOnce('offline');await user.click(toggle);
 expect(await screen.findByText('Could not save automatic sync. Try again.')).toBeInTheDocument();expect(toggle).toBeChecked();expect(toggle).toBeEnabled();
});
