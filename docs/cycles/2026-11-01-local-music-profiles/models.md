# Local analyser pack

Muse's optional macOS arm64 analyser pack uses CPython 3.14 from Astral's Python Build Standalone and the Essentia TensorFlow package. It is installed in Muse's app-data cache, separate from system Python. Exact release URLs, byte counts and SHA256 hashes are pinned in `src-tauri/src/music_profiles/assets.json`. All assets use HTTPS and restricted redirect hosts. Model/version changes must bump `profile::VERSION` and the manifest version to invalidate cached profiles.

The shared 16kHz MusiCNN embedding model feeds MTG classifiers for relaxed/happy/sad/aggressive moods, danceability and voice/instrumental. Published class-index order is stored in the manifest; code never assumes class0 means a positive label. Energy is an explicitly estimated weighted composite, not a calibrated emotion score. Confidence is a margin/agreement estimate. Tempo is optional and estimated from a resampled middle excerpt. The standard mood matcher applies explicit eligibility thresholds and user corrections; it uses no language-model API.

Native Rodio samples up to three15-second excerpts at18%,48%,78% positions for tracks at least60seconds long; shorter tracks use up to45seconds from the start. An anti-alias lowpass precedes mono16kHz downsampling. Remote reads use existing trusted SSH selection/path validation, a32MiB read budget and cancellation. Audio is held in bounded memory and sent only through a local child stdin pipe. No audio samples are written to the library, sent to OpenAI, or uploaded to model hosts. Installation alone contacts public artifact hosts. Metadata/model uncertainty and section variation require pilot review; do not claim calibrated accuracy.

Source and licences:
- [Essentia models](https://essentia.upf.edu/models.html)
- [Essentia TensorFlow integration](https://essentia.upf.edu/machine_learning.html)
- [Essentia/model licensing](https://essentia.upf.edu/licensing_information.html): library AGPLv3; model weights CC BY-NC-ND4.0 for non-commercial use. Public/commercial distribution requires reviewing the applicable licence terms; this personal pack is not bundled into Muse's application.
- [Essentia source](https://github.com/MTG/essentia), Music Technology Group, Universitat Pompeu Fabra.
- [Python Build Standalone](https://github.com/astral-sh/python-build-standalone): Python and runtime notices ship in the downloaded archive.
- NumPy, PyYAML, six and Essentia wheel distribution metadata/licence files remain in the extracted package directory.

Schema additions are `CREATE TABLE IF NOT EXISTS` and preserve catalog version3 compatibility. Profile/override rows reference track identities with cascade cleanup. Local fingerprints include file size/mtime; SSH fingerprints include canonical track identity, size/mtime and trusted host identity. Corrections remain separate from model outputs. Automatic jobs are opt-in and skip unchanged profiles; failed background files are suppressed for an hour unless manually retried.

AI DJ targets3600seconds, normally about20tracks with a30-track ceiling. It starts the existing player in ordered/non-repeating mode, saves no playlist, and reports a shorter session when suitable tracks are scarce. The left navigation's AI playlist action still saves a normal playlist, up to20tracks, using the same local profiles. OpenAI album metadata/cover lookup remains unchanged.
