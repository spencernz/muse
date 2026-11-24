# Status
Implementing.

# Problem and outcome
Some music servers (for example a home NAS) give the user an SSH username and password but no key. Muse's SSH/SFTP source only accepts an SSH agent or a private key file, so these users cannot connect. They should be able to sign in with their SSH password, then browse, sync and play remote music as key users do.

# Scope
Included:
- A **Password** sign-in method next to SSH agent and private key file.
- SSH `password` authentication, with `keyboard-interactive` fallback that answers password prompts.
- The password is saved in the OS credential store (GNOME Keyring / Secret Service on Linux, Keychain on macOS) under a slot for user, host and port. It is never written to SQLite, localStorage or logs, and never returned to the webview.
- Reconnect, Test connection, Sync and remote playback read the saved password.
- Disconnect SSH deletes the saved password. Switching a connection to key/agent authentication deletes its saved password.
- The host-key trust flow is unchanged: the password is used only after the server fingerprint is verified.

Excluded: encrypted private-key passphrases, multiple saved servers, OTP/2FA prompts.

# Acceptance criteria
- Choosing **Password** shows a masked password field; Connect is disabled until a password is entered, unless a password is already saved for this connection.
- With a correct password, a first connection shows the fingerprint dialog, then authenticates and lists the folder; the password field is cleared.
- The saved SQLite profile contains `passwordAuth: true` and no password; the state returned to the UI contains no password.
- Reconnect, Sync and playback authenticate with the saved password without asking again.
- A wrong password shows a sign-in failure message that mentions the password. A missing saved password asks the user to enter it again. An unavailable keyring shows a credential-store message.
- Disconnect removes the saved password.
- Existing agent/key profiles and synced remote tracks keep working unchanged.
- Rust tests, Vitest tests, `make typecheck` and `make lint` pass.

# Decisions and open questions
- The user asked to log in with a username and password (2026-11-24). Saving in the OS keyring was chosen so reconnects and background sync work, matching how Plex/AI credentials are already stored.
- Password and key file are mutually exclusive in one profile.
- `passwordAuth` is serialized only when true, so existing saved profiles are byte-identical and remote sources keep matching. Track availability ignores `passwordAuth`, like `identityFile`, so changing the sign-in method does not hide synced tracks.
