# AirPlay and audio output

Muse's output picker routes the existing native player to audio devices exposed by macOS Core Audio, including connected AirPlay speakers. It does not upload a music file, expose SSH credentials to a receiver, capture system audio or create another audio player. Both local files and SSH-streamed tracks use this output.

## Use it

1. Put the Mac and receiver on a network that supports AirPlay. Turn on the receiver and follow its pairing instructions. Apple documents selection through [Control Center → Sound](https://support.apple.com/en-gb/105068).
2. In Muse, click **AirPlay / audio output** in the playback bar or Now Playing.
3. Choose an output and click **Use this output**. The dialog shows the current output and connection result. The current track, queue, pause/play state, position, volume, shuffle/repeat and playback history remain intact.
4. If the speaker is missing, use **Open Sound settings** or macOS Control Center → Sound to connect it, then **Refresh outputs** in Muse. This version lists devices registered with Core Audio; it does not independently discover or pair network receivers.
5. Choose **System default** to follow the Mac's selected output. Selecting an explicit device in Muse affects Muse's stream; Muse does not change the Mac's default output. Choosing a destination in macOS itself affects system audio according to macOS settings.

A disconnected output pauses playback with recovery guidance. Choose an available output and press Play. A failed output selection keeps the previous stream and queue. An unavailable explicit destination never falls back silently to another device. Output choice is session-only; the next launch uses System default. Network buffering and AirPlay latency are controlled by macOS and the receiver. Multi-room setup, receiver passwords and pairing are handled in macOS; Muse has no custom AirPlay sender, per-speaker synchronisation or AirPlay support on Windows/Linux. Other native audio outputs can still be selected where the audio backend supports them.

## Implementation and validation

Rodio/CPAL's Core Audio DefaultOutput AudioUnit follows system routing. Explicit outputs use a HAL AudioUnit. A persistent stereo mixer owns the original sink/decoder; generation-gated output readers switch hardware without reopening local audio or the SFTP connection. Only the active hardware stream consumes samples, readers hand off complete stereo frames, and callback contention produces silence instead of blocking. Candidate streams are validated before replacing the active route. Stream errors pause the current sink; seeking has a timeout so a disconnected callback cannot block the native player thread indefinitely.

Device IDs are opaque native session identifiers tied to actual Core Audio device handles. Refresh retains identities across reordering and distinguishes devices with the same display name. Removed or forged IDs fail closed. The Sound settings command opens a fixed Apple settings URL and accepts no arbitrary frontend URL or shell command. No schema migration, credential storage or added package is required.

Tests cover device identity/reordering/removal, failed selection retaining the active source, stereo handoff, callback contention, picker loading/error/empty/select/refresh, keyboard dismissal, focus restoration and unchanged player state. A physical AirPlay receiver is required to verify actual delivery, pairing and network reconnect behaviour; passing automated checks alone does not establish those hardware behaviours.

References: [Apple AirPlay audio](https://support.apple.com/en-gb/105068), [Apple AVRoutePickerView player](https://developer.apple.com/documentation/avkit/avroutepickerview/player), [CPAL 0.16 Core Audio implementation](https://github.com/RustAudio/cpal/tree/v0.16.0/src/host/coreaudio/macos), [Rodio 0.21.1 output streams](https://docs.rs/rodio/0.21.1/rodio/struct.OutputStreamBuilder.html).
