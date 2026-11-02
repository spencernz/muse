use super::profile::{Profile, VERSION};
use crate::db::Result;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc,
    },
    time::{Duration, Instant},
};
#[derive(Deserialize)]
pub struct Asset {
    pub name: String,
    pub kind: String,
    pub url: String,
    pub sha256: String,
    pub size: u64,
}
#[derive(Deserialize)]
pub struct Manifest {
    pub version: String,
    pub assets: Vec<Asset>,
}
pub fn manifest() -> Manifest {
    serde_json::from_str(include_str!("assets.json")).expect("validated embedded model manifest")
}
pub fn root(db: &crate::db::Db) -> PathBuf {
    db.path
        .parent()
        .unwrap()
        .join("music-analysis")
        .join(VERSION)
}
pub fn ready(root: &Path) -> bool {
    root.join("ready").is_file()
        && root.join("python/bin/python3.14").is_file()
        && root.join("worker.py").is_file()
}
fn allowed(url: &url::Url) -> bool {
    url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && matches!(
            url.host_str(),
            Some(
                "github.com"
                    | "release-assets.githubusercontent.com"
                    | "objects.githubusercontent.com"
                    | "files.pythonhosted.org"
                    | "essentia.upf.edu"
            )
        )
}
fn download(
    client: &reqwest::Client,
    asset: &Asset,
    path: &Path,
    cancel: &AtomicBool,
    progress: &impl Fn(String),
) -> Result<()> {
    if !allowed(&url::Url::parse(&asset.url).map_err(|_| "Invalid analyser asset.")?)
        || asset.size > 180 * 1024 * 1024
        || asset.name.contains('/')
        || asset.name.contains("..")
    {
        return Err("Invalid analyser asset.".into());
    }
    tauri::async_runtime::block_on(async {
        let mut response = client
            .get(&asset.url)
            .send()
            .await
            .map_err(|_| "Could not download local analyser. Check your connection and retry.")?
            .error_for_status()
            .map_err(|_| "Could not download local analyser. Check your connection and retry.")?;
        if response.content_length().is_some_and(|n| n > asset.size) {
            return Err("Analyser download size mismatch.".into());
        }
        let mut file = std::fs::File::create(path).map_err(|_| "Cannot create analyser cache.")?;
        let mut hash = Sha256::new();
        let mut count = 0u64;
        let mut last = 0;
        loop {
            if cancel.load(Ordering::Acquire) {
                return Err("Analysis cancelled.".into());
            }
            let Some(bytes) = response
                .chunk()
                .await
                .map_err(|_| "Analyser download interrupted. Retry installation.")?
            else {
                break;
            };
            count += bytes.len() as u64;
            if count > asset.size {
                return Err("Analyser download exceeds its expected size.".into());
            }
            hash.update(&bytes);
            file.write_all(&bytes)
                .map_err(|_| "Cannot write analyser cache.")?;
            let mb = count / (1024 * 1024);
            if mb != last {
                last = mb;
                progress(format!("Downloading local analyser · {mb} MB"));
            }
        }
        if count != asset.size || format!("{:x}", hash.finalize()) != asset.sha256 {
            return Err("Analyser integrity check failed. Retry installation.".into());
        }
        Ok(())
    })
}
fn run_child(mut child: Child, cancel: &AtomicBool, limit: Duration) -> Result<()> {
    let start = Instant::now();
    loop {
        if cancel.load(Ordering::Acquire) || start.elapsed() > limit {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Analyser setup cancelled or timed out.".into());
        }
        match child.try_wait() {
            Ok(Some(status)) => {
                return if status.success() {
                    Ok(())
                } else {
                    Err("Local analyser setup failed. Retry installation.".into())
                }
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("Cannot check analyser setup.".into());
            }
        }
    }
}
pub fn install(
    destination: &Path,
    cancel: Arc<AtomicBool>,
    progress: impl Fn(String),
) -> Result<()> {
    if !cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        return Err("Local model installation currently supports Apple Silicon Macs.".into());
    }
    if ready(destination) {
        return Ok(());
    }
    let parent = destination.parent().ok_or("Invalid analyser cache.")?;
    std::fs::create_dir_all(parent).map_err(|_| "Cannot create analyser cache.")?;
    let stage = parent.join(format!(".install-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&stage).map_err(|_| "Cannot create analyser staging folder.")?;
    let result = (|| {
        let manifest = manifest();
        if manifest.version != VERSION {
            return Err("Analyser version mismatch.".into());
        }
        let client = reqwest::Client::builder()
            .https_only(true)
            .connect_timeout(Duration::from_secs(15))
            .timeout(Duration::from_secs(180))
            .read_timeout(Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::custom(|attempt| {
                if attempt.previous().len() < 5 && allowed(attempt.url()) {
                    attempt.follow()
                } else {
                    attempt.stop()
                }
            }))
            .build()
            .map_err(|_| "Cannot start analyser download.")?;
        for asset in &manifest.assets {
            progress(format!("Downloading {}…", asset.name));
            download(&client, asset, &stage.join(&asset.name), &cancel, &progress)?;
        }
        progress("Preparing isolated local analyser…".into());
        let child = Command::new("/usr/bin/tar")
            .args(["-xzf"])
            .arg(stage.join("python.tar.gz"))
            .arg("-C")
            .arg(&stage)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| "Cannot unpack local analyser.")?;
        run_child(child, &cancel, Duration::from_secs(90))?;
        // All wheel bytes have already passed pinned SHA256 checks. Only package files
        // are extracted; no pip, install hooks, system Python or shell is involved.
        let unpack = r#"import pathlib,sys,zipfile
root=pathlib.Path(sys.argv[1]);target=root/'packages';target.mkdir()
for wheel in root.glob('*.whl'):
 with zipfile.ZipFile(wheel) as archive:
  for entry in archive.infolist():
   p=pathlib.PurePosixPath(entry.filename)
   if p.is_absolute() or '..' in p.parts:raise ValueError('Unsafe wheel member')
  archive.extractall(target)
"#;
        let child = Command::new(stage.join("python/bin/python3.14"))
            .args(["-I", "-c", unpack])
            .arg(&stage)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| "Cannot start isolated analyser runtime.")?;
        run_child(child, &cancel, Duration::from_secs(90))?;
        std::fs::write(stage.join("worker.py"), include_str!("worker.py"))
            .map_err(|_| "Cannot prepare analyser worker.")?;
        std::fs::write(stage.join("assets.json"), include_str!("assets.json"))
            .map_err(|_| "Cannot prepare analyser models.")?;
        progress("Checking local models…".into());
        let worker = Worker::start(&stage, cancel.clone())?;
        drop(worker);
        for asset in &manifest.assets {
            if asset.kind != "model" {
                std::fs::remove_file(stage.join(&asset.name))
                    .map_err(|_| "Cannot clean analyser downloads.")?;
            }
        }
        std::fs::write(stage.join("ready"), VERSION)
            .map_err(|_| "Cannot finish analyser installation.")?;
        if cancel.load(Ordering::Acquire) {
            return Err("Analysis cancelled.".into());
        }
        if destination.exists() {
            std::fs::remove_dir_all(destination)
                .map_err(|_| "Cannot replace incomplete analyser cache.")?;
        }
        std::fs::rename(&stage, destination).map_err(|_| "Cannot finish analyser installation.")?;
        Ok(())
    })();
    if stage.exists() {
        let _ = std::fs::remove_dir_all(&stage);
    }
    result
}
pub struct Worker {
    child: Child,
    input: Option<ChildStdin>,
    output: mpsc::Receiver<Result<serde_json::Value>>,
    cancel: Arc<AtomicBool>,
}
impl Worker {
    pub fn start(root: &Path, cancel: Arc<AtomicBool>) -> Result<Self> {
        let mut child = Command::new(root.join("python/bin/python3.14"))
            .args(["-I", "-u"])
            .arg(root.join("worker.py"))
            .arg(root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| "Cannot start local analyser. Reinstall its model pack.")?;
        let input = child.stdin.take();
        let output = child.stdout.take().ok_or("Cannot read analyser output.")?;
        let (tx, rx) = mpsc::sync_channel(4);
        std::thread::spawn(move || {
            let mut reader = BufReader::new(output);
            loop {
                let mut line = String::new();
                let count = reader.by_ref().take(16385).read_line(&mut line);
                let result = match count {
                    Ok(0) => break,
                    Ok(n) if n <= 16384 => serde_json::from_str(&line)
                        .map_err(|_| "Invalid local analyser response.".into()),
                    _ => Err("Local analyser response exceeds its limit.".into()),
                };
                if tx.send(result).is_err() {
                    break;
                }
            }
        });
        let mut value = Self {
            child,
            input,
            output: rx,
            cancel,
        };
        let reply = value.receive(Duration::from_secs(180))?;
        if reply["ready"] != true || reply["version"] != VERSION {
            return Err("Local analyser version mismatch. Reinstall its model pack.".into());
        }
        Ok(value)
    }
    fn receive(&mut self, timeout: Duration) -> Result<serde_json::Value> {
        let start = Instant::now();
        loop {
            if self.cancel.load(Ordering::Acquire) || start.elapsed() > timeout {
                let _ = self.child.kill();
                return Err("Local analysis cancelled or timed out.".into());
            }
            match self.output.recv_timeout(Duration::from_millis(50)) {
                Ok(value) => return value,
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(_) => {
                    return Err(
                        "Local analyser stopped unexpectedly. Reinstall its model pack.".into(),
                    )
                }
            }
        }
    }
    pub fn infer(&mut self, samples: Vec<f32>) -> Result<Profile> {
        if !(16000 * 6..=16000 * 60).contains(&samples.len()) {
            return Err("Not enough decoded audio to analyse this track.".into());
        }
        let mut input = self
            .input
            .take()
            .ok_or("Local analyser input unavailable.")?;
        let cancel = self.cancel.clone();
        let (tx, rx) = mpsc::sync_channel(1);
        std::thread::spawn(move || {
            let result = (|| -> std::io::Result<()> {
                writeln!(input, "{{\"samples\":{}}}", samples.len())?;
                for chunk in samples.chunks(1024) {
                    if cancel.load(Ordering::Acquire) {
                        return Err(std::io::Error::other("Cancelled"));
                    }
                    let mut bytes = [0u8; 4096];
                    for (i, value) in chunk.iter().enumerate() {
                        bytes[i * 4..i * 4 + 4].copy_from_slice(&value.to_le_bytes());
                    }
                    input.write_all(&bytes[..chunk.len() * 4])?;
                }
                input.flush()
            })();
            let _ = tx.send((input, result));
        });
        let reply = self.receive(Duration::from_secs(120))?;
        let (input, result) = rx
            .recv_timeout(Duration::from_secs(2))
            .map_err(|_| "Local analyser input timed out.")?;
        self.input = Some(input);
        result.map_err(|_| "Could not send samples to local analyser.")?;
        if reply.get("error").is_some() {
            return Err("Local model could not analyse this sample. Try another track.".into());
        }
        let profile: Profile = serde_json::from_value(reply["profile"].clone())
            .map_err(|_| "Invalid local track profile.")?;
        if !profile.validate() {
            return Err("Invalid local track profile scores.".into());
        }
        Ok(profile)
    }
}
impl Drop for Worker {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pack_manifest_has_pinned_safe_artifacts_and_redirects_cannot_escape() {
        let pack = manifest();
        assert_eq!(pack.version, VERSION);
        assert_eq!(pack.assets.iter().filter(|a| a.kind == "model").count(), 7);
        for asset in pack.assets {
            assert!(allowed(&url::Url::parse(&asset.url).unwrap()));
            assert_eq!(asset.sha256.len(), 64);
            assert!(asset.sha256.bytes().all(|b| b.is_ascii_hexdigit()));
            assert!(!asset.name.contains('/'));
            assert!(asset.size > 0 && asset.size < 180 * 1024 * 1024);
        }
        for address in [
            "http://essentia.upf.edu/model",
            "https://evil.example/model",
            "https://token@essentia.upf.edu/model",
            "https://127.0.0.1/model",
        ] {
            assert!(!allowed(&url::Url::parse(address).unwrap()));
        }
    }
}
