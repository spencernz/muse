# Steps
- [x] Add `deb` to `bundle.targets` alongside `app`; add `bundle.linux.deb.depends` for ALSA and D-Bus.
- [x] Add `make bundle`.
- [x] Document Linux prerequisites, build, install and data location in README.
- [x] Install toolchain prerequisites (Rust via rustup; system libraries and Node by the user).
- [x] Build the `.deb` on Ubuntu, inspect control metadata and contents, and smoke-launch the packaged binary.
- [x] Install with apt and launch from the app launcher (done by the user).

# Validation
- `npm run bundle` on Ubuntu; `dpkg-deb -I` and `dpkg-deb -c` on the output.
- Install with apt and launch Muse.
- `make typecheck`, `make lint`.
- macOS: config retains `app`; no Mac available in this session, so a Mac bundle run is unverified.

# Progress and decisions
Config, Makefile and README updated. Rust 1.100.0 installed with rustup (minimal profile plus clippy). The user installed system libraries and Node 22.22.1 with apt. The first package showed `Description: (none)` for the long description, so `bundle.longDescription` was added. Tauri added `libayatana-appindicator3-1`, `libwebkit2gtk-4.1-0` and `libgtk-3-0` to Depends by itself.

# Results
- `npm run bundle` on Ubuntu 26.04 (Rust 1.100.0, Node 22.22.1): passed. First build took 4m48s and produced `src-tauri/target/release/bundle/deb/Muse_0.1.0_amd64.deb` (42 MiB). The `app` target was filtered out on Linux with no warning.
- `dpkg-deb -I`: Package `muse` 0.1.0 amd64; Depends `libasound2t64 | libasound2, libdbus-1-3, libayatana-appindicator3-1, libwebkit2gtk-4.1-0, libgtk-3-0`; short and long descriptions present.
- `dpkg-deb -c`: `/usr/bin/muse`, `/usr/share/applications/Muse.desktop` (Categories AudioVideo;Audio;Music), hicolor icons at 32, 128 and 256@2.
- Packaged binary run directly for 8 s under Wayland: it stayed running with no errors on stderr and was stopped by the timeout (exit 124).
- `make typecheck`, `make lint`: passed.
- User installed the `.deb` with apt and confirmed Muse works (2026-11-24).
- Not verified: macOS `npm run bundle` (no Mac in this session). The `app` target is unchanged.
