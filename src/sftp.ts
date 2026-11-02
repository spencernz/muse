import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export interface SftpConfig {
  host: string;
  port: number;
  username: string;
  root: string;
  identityFile: string | null;
}
export interface ServerKey {
  algorithm: string;
  fingerprint: string;
}
export interface HostChallenge {
  id: string;
  host: string;
  port: number;
  key: ServerKey;
  expiresAt: number;
}
export interface KeyMismatch {
  host: string;
  port: number;
  expected: ServerKey;
  observed: ServerKey;
}
export interface RemoteEntry {
  name: string;
  kind: "directory" | "file" | "symlink";
  size: number | null;
}
export interface FolderListing {
  root: string;
  relative: string;
  parent: string | null;
  entries: RemoteEntry[];
  truncated: boolean;
}
export interface SftpState {
  profile: SftpConfig | null;
  status: "disconnected" | "configured" | "connected" | "error";
  listing: FolderListing | null;
  trustedKey: ServerKey | null;
  keyMismatch: KeyMismatch | null;
}
export interface SftpConnectResult {
  state: SftpState;
  challenge: HostChallenge | null;
}
export interface AutoSync {enabled:boolean;intervalMinutes:number}
export interface RemoteSyncStatus {
  unchanged?:number;
  running: boolean;
  scanned: number;
  indexed: number;
  skipped: number;
  message: string;
  error: string | null;
  completedAt: number | null;
}
export const sftp = {
  autoSync:()=>invoke<AutoSync>("sftp_auto_sync"),
  saveAutoSync:(value:AutoSync)=>invoke<AutoSync>("sftp_auto_sync_save",{value}),
  syncStatus: () => invoke<RemoteSyncStatus>("sftp_sync_status"),
  syncStart: () => invoke<RemoteSyncStatus>("sftp_sync_start"),
  syncCancel: () => invoke<void>("sftp_sync_cancel"),
  state: () => invoke<SftpState>("sftp_state"),
  connect: (config: SftpConfig) =>
    invoke<SftpConnectResult>("sftp_connect", { config }),
  confirmHost: (id: string) => invoke<SftpState>("sftp_confirm_host", { id }),
  cancelHost: (id: string) => invoke<void>("sftp_cancel_host", { id }),
  browse: (relative: string) => invoke<SftpState>("sftp_browse", { relative }),
  chooseFolder: (relative: string) =>
    invoke<SftpState>("sftp_choose_folder", { relative }),
  reconnect: () => invoke<SftpConnectResult>("sftp_reconnect"),
  disconnect: () => invoke<SftpState>("sftp_disconnect"),
  forgetHost: (host: string, port: number, fingerprint: string) =>
    invoke<SftpState>("sftp_forget_host", { host, port, fingerprint }),
  pickKey: async () => {
    const file = await open({
      title: "Choose your SSH private key",
      directory: false,
      multiple: false,
    });
    return typeof file === "string" ? file : null;
  },
};
export function sftpMessage(value: unknown): string {
  const code =
    value && typeof value === "object" && "code" in value
      ? String(value.code)
      : "";
  const messages: Record<string, string> = {
    invalid_config:
      "Enter a hostname, valid port, SSH username, and absolute remote folder path.",
    unsafe_address: "This address is not an allowed SSH destination.",
    unreachable:
      "Could not reach the server. Check the address, SSH port, router forwarding, and network, then retry.",
    protocol: "This server did not provide a supported SSH/SFTP connection.",
    authentication:
      "SSH key authentication failed. Check your username and that your public key is authorized. Unlock encrypted keys in your SSH agent.",
    key_file:
      "Choose a readable private key, not the .pub file. Restrict its permissions or unlock encrypted keys in your SSH agent.",
    host_key_changed:
      "The server key changed. Verify the new fingerprint with the server owner before resetting saved trust.",
    confirmation_expired:
      "This server verification is no longer current. Connect again to get a fresh fingerprint.",
    not_connected: "Connect to the SSH server first.",
    folder_unavailable:
      "This folder is unavailable or unreadable. Check its path and your account permissions.",
    path_outside_root:
      "Choose a folder inside the selected music folder. Links outside it are not followed.",
    storage:
      "Could not read or save the SSH connection. Check the app data folder and retry.",
    busy: "An SSH operation is already running. Wait for it to finish and retry.",
  };
  return (
    messages[code] ??
    "Could not complete the SSH request. Check your connection and retry."
  );
}
