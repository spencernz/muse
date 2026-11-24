# Status
Complete.

# Problem and outcome
Muse only bundles a macOS `.app`. Ubuntu users need an installable `.deb`. The same configuration must keep producing the macOS app on a Mac and produce a Debian package on Linux.

# Scope
Included: Tauri bundle targets for macOS (`app`) and Linux (`deb`); Debian runtime dependencies that Tauri does not infer (ALSA audio, D-Bus secret service); a `make bundle` shortcut; README build/install/storage notes for Linux.

Excluded: AppImage/RPM, Windows installers, code signing, apt repository publishing, Linux-specific UI redesign. The macOS Overlay title bar is ignored on Linux and the frontend already gates its macOS spacing on `macWindow`, so Linux uses the native title bar.

# Acceptance criteria
- `npm run bundle` on Linux produces `src-tauri/target/release/bundle/deb/Muse_<version>_amd64.deb` with no extra flags.
- The macOS bundle target `app` remains in the configuration, so `npm run bundle` on a Mac still produces `Muse.app`.
- The package control file names Muse, its version, and depends on WebKitGTK, ALSA and D-Bus libraries; the package installs a `.desktop` entry and icons.
- The installed `.deb` launches Muse on Ubuntu.
- `make typecheck` and `make lint` pass.

# Decisions and open questions
- User decision (2026-11-24): support both macOS and Ubuntu packaging.
- Unsupported bundle targets for the host OS are filtered by the Tauri bundler, so one target list serves both platforms.
- System build libraries need sudo; the user installs them. Rust is installed per user through rustup.
