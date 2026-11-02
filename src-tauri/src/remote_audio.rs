//! A bounded PCM input for the existing Rodio sink. Device callbacks never do network I/O.
use crate::{
    db::{Db, Result},
    providers::{
        remote::{open_track, CheckedReader, Selection},
        sftp_transport::SshConnector,
    },
};
use rodio::{source::SeekError, Decoder, Source};
use std::{
    io::BufReader,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc::{self, Receiver, SyncSender, TryRecvError, TrySendError},
        Arc, Mutex,
    },
    time::Duration,
};

#[derive(Clone)]
pub struct RemoteHealth {
    pub cancel: Arc<AtomicBool>,
    pub failed: Arc<AtomicBool>,
    samples: Arc<AtomicU64>,
    issue: Arc<Mutex<Option<String>>>,
    channels: u16,
    rate: u32,
    pub selected: Selection,
}
impl RemoteHealth {
    pub fn position(&self) -> f64 {
        self.samples.load(Ordering::Relaxed) as f64 / (self.channels as f64 * self.rate as f64)
    }
    pub fn error(&self) -> Option<String> {
        self.issue.lock().ok().and_then(|e| e.clone()).or_else(|| {
            self.failed.load(Ordering::Acquire).then(|| {
                "Remote connection interrupted. Reconnect SSH, then play this track again.".into()
            })
        })
    }
}
struct Chunk {
    generation: u64,
    samples: Vec<f32>,
    eof: bool,
}
struct Seek {
    generation: u64,
    position: Duration,
}
pub struct BufferedAudio {
    receiver: Mutex<Receiver<Chunk>>,
    commands: SyncSender<Seek>,
    samples: std::vec::IntoIter<f32>,
    generation: u64,
    duration: Option<Duration>,
    health: RemoteHealth,
    ended: bool,
}
impl BufferedAudio {
    pub fn open(db: &Db, id: &str) -> Result<(Self, RemoteHealth)> {
        let (file, selected) = open_track(db, id, &SshConnector)?;
        let size = file.size;
        let cancel = Arc::new(AtomicBool::new(false));
        let reader = CheckedReader::new(file, u64::MAX, cancel.clone());
        let failed = reader.failed.clone();
        let decoder = Decoder::builder()
            .with_data(BufReader::with_capacity(128 * 1024, reader))
            .with_byte_len(size)
            .with_seekable(true)
            .build()
            .map_err(|_| "Cannot decode this remote audio format. Try another track.")?;
        let health = RemoteHealth {
            cancel,
            failed,
            samples: Arc::new(AtomicU64::new(0)),
            issue: Arc::new(Mutex::new(None)),
            channels: decoder.channels(),
            rate: decoder.sample_rate(),
            selected,
        };
        let source = Self::buffer(decoder, health.clone());
        Ok((source, health))
    }
    fn buffer<S: Source + Send + 'static>(mut decoder: S, health: RemoteHealth) -> Self {
        let duration = decoder.total_duration();
        let (sender, receiver) = mpsc::sync_channel(16);
        let (commands, requests) = mpsc::sync_channel::<Seek>(8);
        let worker = health.clone();
        std::thread::spawn(move || {
            let mut generation = 0;
            let mut pending: Option<Chunk> = None;
            let mut at_eof = false;
            loop {
                if worker.cancel.load(Ordering::Acquire) {
                    break;
                }
                while let Ok(seek) = requests.try_recv() {
                    generation = seek.generation;
                    at_eof = false;
                    pending = None;
                    if decoder.try_seek(seek.position).is_err() {
                        *worker.issue.lock().unwrap_or_else(|e| e.into_inner()) = Some(
                            "Cannot seek this remote track. Play it again from the beginning."
                                .into(),
                        );
                        return;
                    }
                }
                if at_eof {
                    std::thread::park_timeout(Duration::from_millis(5));
                    continue;
                }
                if pending.is_none() {
                    let samples: Vec<f32> = decoder.by_ref().take(8192).collect();
                    pending = Some(Chunk {
                        generation,
                        eof: samples.is_empty(),
                        samples,
                    });
                }
                let chunk = pending.take().unwrap();
                let eof = chunk.eof;
                match sender.try_send(chunk) {
                    Ok(()) if eof => {
                        at_eof = true;
                    }
                    Ok(()) => {}
                    Err(TrySendError::Disconnected(_)) => break,
                    Err(TrySendError::Full(chunk)) => {
                        pending = Some(chunk);
                        std::thread::park_timeout(Duration::from_millis(5));
                    }
                }
            }
        });
        Self {
            receiver: Mutex::new(receiver),
            commands,
            samples: Vec::new().into_iter(),
            generation: 0,
            duration,
            health,
            ended: false,
        }
    }
}
impl Iterator for BufferedAudio {
    type Item = f32;
    fn next(&mut self) -> Option<f32> {
        if self.ended || self.health.cancel.load(Ordering::Acquire) {
            return None;
        }
        if let Some(sample) = self.samples.next() {
            self.health.samples.fetch_add(1, Ordering::Relaxed);
            return Some(sample);
        }
        // Bounded nonblocking receive: underruns output silence without moving the track clock.
        let receiver = self.receiver.get_mut().unwrap_or_else(|e| e.into_inner());
        for _ in 0..17 {
            match receiver.try_recv() {
                Ok(chunk) if chunk.generation != self.generation => continue,
                Ok(chunk) if chunk.eof => {
                    self.ended = true;
                    return None;
                }
                Ok(chunk) => {
                    self.samples = chunk.samples.into_iter();
                    if let Some(sample) = self.samples.next() {
                        self.health.samples.fetch_add(1, Ordering::Relaxed);
                        return Some(sample);
                    }
                }
                Err(TryRecvError::Empty) => return Some(0.),
                Err(TryRecvError::Disconnected) => {
                    self.health.failed.store(true, Ordering::Release);
                    self.ended = true;
                    return None;
                }
            }
        }
        Some(0.)
    }
}
impl Source for BufferedAudio {
    fn current_span_len(&self) -> Option<usize> {
        Some(8192)
    }
    fn channels(&self) -> u16 {
        self.health.channels
    }
    fn sample_rate(&self) -> u32 {
        self.health.rate
    }
    fn total_duration(&self) -> Option<Duration> {
        self.duration
    }
    fn try_seek(&mut self, position: Duration) -> std::result::Result<(), SeekError> {
        let generation = self.generation.wrapping_add(1);
        self.commands
            .try_send(Seek {
                generation,
                position,
            })
            .map_err(|_| {
                SeekError::Other(Box::new(std::io::Error::other("Remote seek unavailable.")))
            })?;
        self.generation = generation;
        self.samples = Vec::new().into_iter();
        self.ended = false;
        self.health.samples.store(
            (position.as_secs_f64() * self.health.channels as f64 * self.health.rate as f64) as u64,
            Ordering::Relaxed,
        );
        Ok(())
    }
}
impl Drop for BufferedAudio {
    fn drop(&mut self) {
        self.health.cancel.store(true, Ordering::Release);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::sftp::{Config, HostKey};
    use std::{collections::BTreeMap, sync::atomic::AtomicUsize, time::Instant};
    struct Synthetic {
        count: Arc<AtomicUsize>,
        gate: Arc<AtomicBool>,
        value: f32,
        remaining: usize,
    }
    impl Iterator for Synthetic {
        type Item = f32;
        fn next(&mut self) -> Option<f32> {
            while self.gate.load(Ordering::Acquire) {
                std::thread::sleep(Duration::from_millis(1));
            }
            if self.remaining == 0 {
                return None;
            }
            self.remaining -= 1;
            self.count.fetch_add(1, Ordering::Relaxed);
            Some(self.value)
        }
    }
    impl Source for Synthetic {
        fn current_span_len(&self) -> Option<usize> {
            None
        }
        fn channels(&self) -> u16 {
            1
        }
        fn sample_rate(&self) -> u32 {
            8000
        }
        fn total_duration(&self) -> Option<Duration> {
            Some(Duration::from_secs(10))
        }
        fn try_seek(&mut self, pos: Duration) -> std::result::Result<(), SeekError> {
            self.value = pos.as_secs_f32() + 1.;
            self.remaining = 80000;
            Ok(())
        }
    }
    fn health() -> RemoteHealth {
        let dir = tempfile::tempdir().unwrap();
        let db = Db::new(dir.path()).unwrap();
        let config = Config {
            host: "music.example.test".into(),
            port: 22,
            username: "listener".into(),
            root: "/music".into(),
            identity_file: None,
        };
        db.set_setting("providers.sftp.profile", &Some(&config))
            .unwrap();
        db.set_setting(
            "providers.sftp.trusted_hosts",
            &BTreeMap::from([(
                "[music.example.test]:22",
                HostKey {
                    algorithm: "ssh-ed25519".into(),
                    fingerprint: "SHA256:test".into(),
                },
            )]),
        )
        .unwrap();
        RemoteHealth {
            cancel: Arc::new(AtomicBool::new(false)),
            failed: Arc::new(AtomicBool::new(false)),
            samples: Arc::new(AtomicU64::new(0)),
            issue: Arc::new(Mutex::new(None)),
            channels: 1,
            rate: 8000,
            selected: Selection::saved(&db).unwrap(),
        }
    }
    fn eventually(mut f: impl FnMut() -> bool) {
        let deadline = Instant::now() + Duration::from_secs(2);
        while !f() {
            assert!(Instant::now() < deadline, "worker timed out");
            std::thread::sleep(Duration::from_millis(2));
        }
    }
    #[test]
    fn stalled_network_never_blocks_callback_or_advances_track_clock_and_drop_cancels() {
        let h = health();
        let gate = Arc::new(AtomicBool::new(true));
        let mut input = BufferedAudio::buffer(
            Synthetic {
                count: Arc::new(AtomicUsize::new(0)),
                gate: gate.clone(),
                value: 1.,
                remaining: 80000,
            },
            h.clone(),
        );
        let start = Instant::now();
        assert_eq!(input.next(), Some(0.));
        assert!(start.elapsed() < Duration::from_millis(20));
        assert_eq!(h.position(), 0.);
        gate.store(false, Ordering::Release);
        eventually(|| input.next() == Some(1.));
        assert!(h.position() > 0.);
        drop(input);
        assert!(h.cancel.load(Ordering::Acquire));
    }
    #[test]
    fn prefetch_is_bounded_and_seek_discards_old_generation_even_after_short_file_eof() {
        let h = health();
        let count = Arc::new(AtomicUsize::new(0));
        let mut input = BufferedAudio::buffer(
            Synthetic {
                count: count.clone(),
                gate: Arc::new(AtomicBool::new(false)),
                value: 1.,
                remaining: 800000,
            },
            h.clone(),
        );
        eventually(|| count.load(Ordering::Relaxed) >= 8192 * 16);
        std::thread::sleep(Duration::from_millis(30));
        assert!(count.load(Ordering::Relaxed) <= 8192 * 17);
        input.try_seek(Duration::from_secs(3)).unwrap();
        eventually(|| {
            let s = input.next().unwrap();
            assert_ne!(s, 1., "stale pre-seek audio");
            s == 4.
        });
        assert!(h.position() >= 3.);
        drop(input);
        let mut short = BufferedAudio::buffer(
            Synthetic {
                count: Arc::new(AtomicUsize::new(0)),
                gate: Arc::new(AtomicBool::new(false)),
                value: 1.,
                remaining: 100,
            },
            health(),
        );
        std::thread::sleep(Duration::from_millis(20));
        short.try_seek(Duration::from_secs(2)).unwrap();
        eventually(|| short.next() == Some(3.));
    }
    #[test]
    fn remote_seek_failure_becomes_playback_error_and_never_blocks_the_callback() {
        let h = health();
        let source = rodio::source::SineWave::new(440.);
        let mut input = BufferedAudio::buffer(source, h.clone());
        let now = Instant::now();
        input.try_seek(Duration::from_secs(3)).unwrap();
        assert!(now.elapsed() < Duration::from_millis(20));
        // SineWave has seek support in some Rodio versions; exercise a source that rejects it.
        struct NoSeek;
        impl Iterator for NoSeek {
            type Item = f32;
            fn next(&mut self) -> Option<f32> {
                Some(1.)
            }
        }
        impl Source for NoSeek {
            fn current_span_len(&self) -> Option<usize> {
                None
            }
            fn channels(&self) -> u16 {
                1
            }
            fn sample_rate(&self) -> u32 {
                8000
            }
            fn total_duration(&self) -> Option<Duration> {
                None
            }
        }
        let h = health();
        let mut input = BufferedAudio::buffer(NoSeek, h.clone());
        input.try_seek(Duration::from_secs(1)).unwrap();
        eventually(|| h.error().is_some());
    }
}
