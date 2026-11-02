# Synthetic codec fixtures

`silence.aac` and `silence-alac.m4a` contain 0.5 seconds of generated silence, not commercial audio. Generated with ffmpeg from `anullsrc=r=44100:cl=stereo`, encoded as ADTS AAC and ALAC in M4A. The MP3, FLAC, and AAC-in-M4A fixtures contain 80 ms of generated mono silence at 44.1 kHz. They are checked in so Rust tests need no ffmpeg or sibling repository. WAV input is generated directly by Rust tests.
