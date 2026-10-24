//! yt-dlp is optional. This module finds it, installs an app-managed copy on request, keeps
//! that copy updated, and runs it.

use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};
use tauri::async_runtime::RwLock;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::process::{CommandEvent, Output};
use tauri_plugin_shell::ShellExt;

const RELEASES: &str = "https://github.com/yt-dlp/yt-dlp/releases";
/// How often the managed copy checks for updates at startup.
const UPDATE_EVERY: Duration = Duration::from_secs(24 * 60 * 60);
/// Minimum gap between update checks triggered by a failing command: most failures (a bad
/// video, no network) have nothing to do with the yt-dlp version.
const RETRY_UPDATE_EVERY: Duration = Duration::from_secs(60 * 60);
const NOT_FOUND: &str = "yt-dlp isn't installed: enable Online in the app, or install yt-dlp \
     so it's on PATH";

/// Runs take the read side, updates the write side, so an update never replaces the binary
/// while it's running (Windows can't replace an exe that's in use).
static BINARY: RwLock<()> = RwLock::const_new(());

#[derive(serde::Serialize)]
pub struct Status {
    available: bool,
    /// Whether the app can download yt-dlp itself on this platform.
    can_install: bool,
    /// Whether ffmpeg was found, for HD video downloads and tagged audio.
    ffmpeg: bool,
}

/// One yt-dlp release, e.g. version `2026.08.19` at `.../releases/download/2026.08.19`.
#[derive(Debug, PartialEq)]
struct Release {
    url: String,
    version: String,
}

#[derive(serde::Serialize, Clone)]
struct DownloadProgress {
    downloaded: u64,
    total: Option<u64>,
}

#[derive(Debug, PartialEq)]
struct Found {
    path: PathBuf,
    source: Source,
}

#[derive(Debug, PartialEq, Clone, Copy)]
enum Source {
    /// Installed by the app into its data dir; updated in place.
    Managed,
    /// Shipped next to the executable by a release installer. It can't be updated in place
    /// (read-only install dir), so once it's outdated a managed copy replaces it in use.
    Bundled,
    /// On PATH, from a package manager, or the dev sidecar: the user's to update.
    External,
}

#[tauri::command]
pub fn yt_dlp_status(app: AppHandle) -> Status {
    Status {
        available: locate(&app).is_some(),
        can_install: asset_name().is_some(),
        ffmpeg: locate_ffmpeg().is_some(),
    }
}

/// Downloads the latest standalone yt-dlp for this platform into the app's data dir and
/// verifies it against the release's SHA2-256SUMS. Emits `yt_dlp_download` progress events.
#[tauri::command]
pub async fn install_yt_dlp(app: AppHandle) -> Result<(), String> {
    let asset = asset_name().ok_or("no yt-dlp build for this platform; install it manually")?;
    let dest = managed_path(&app).ok_or("no app data directory")?;
    let _lock = BINARY.write().await;
    let release = latest_release().await?;
    download(&release, asset, &dest, |downloaded, total| {
        app.emit("yt_dlp_download", DownloadProgress { downloaded, total })
            .ok();
    })
    .await?;
    std::fs::write(version_file(&dest), &release.version).ok();
    Ok(())
}

/// Runs yt-dlp with `args` and returns its stdout. If a managed or bundled copy fails, it's
/// updated and the command retried once: most failures are YouTube changes that a newer
/// yt-dlp fixes.
pub async fn run(app: &AppHandle, args: &[&str]) -> Result<String, String> {
    let found = locate(app).ok_or(NOT_FOUND)?;
    let mut output = exec(app, &found.path, args).await?;

    if !output.status.success() {
        if let Some(found) = updated_copy(app, &found).await {
            output = exec(app, &found.path, args).await?;
        }
    }

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("yt-dlp exited with error: {stderr}"));
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Like [`run`], but hands each line of output (stdout and stderr) to `on_line` as it arrives,
/// for long-running commands such as downloads.
pub async fn run_streaming(
    app: &AppHandle,
    args: &[&str],
    mut on_line: impl FnMut(&str),
) -> Result<String, String> {
    let found = locate(app).ok_or(NOT_FOUND)?;
    let mut output = exec_streaming(app, &found.path, args, &mut on_line).await?;

    if !output.success {
        if let Some(found) = updated_copy(app, &found).await {
            output = exec_streaming(app, &found.path, args, &mut on_line).await?;
        }
    }

    if !output.success {
        return Err(format!("yt-dlp exited with error: {}", output.stderr));
    }
    Ok(output.stdout)
}

/// After a failed run: updates yt-dlp if a check is due and returns the copy to retry with, or
/// `None` if there's nothing newer. An outdated bundled copy is superseded by a managed one, so
/// this looks it up again.
async fn updated_copy(app: &AppHandle, found: &Found) -> Option<Found> {
    if update_due(app, RETRY_UPDATE_EVERY) && update(app, found, RETRY_UPDATE_EVERY).await {
        locate(app)
    } else {
        None
    }
}

/// At startup, updates the copy in use if it hasn't been checked in a day.
pub async fn auto_update(app: AppHandle) {
    if let Some(found) = locate(&app) {
        if update_due(&app, UPDATE_EVERY) {
            update(&app, &found, UPDATE_EVERY).await;
        }
    }
}

fn update_due(app: &AppHandle, interval: Duration) -> bool {
    managed_path(app).is_some_and(|p| is_due(&version_file(&p), interval))
}

async fn exec(app: &AppHandle, path: &Path, args: &[&str]) -> Result<Output, String> {
    let _lock = BINARY.read().await;
    app.shell()
        .command(path)
        .args(args)
        .output()
        .await
        .map_err(|e| format!("yt-dlp execution failed: {e}"))
}

struct Captured {
    success: bool,
    stdout: String,
    stderr: String,
}

async fn exec_streaming(
    app: &AppHandle,
    path: &Path,
    args: &[&str],
    on_line: &mut impl FnMut(&str),
) -> Result<Captured, String> {
    let _lock = BINARY.read().await;
    let (mut events, _child) = app
        .shell()
        .command(path)
        .args(args)
        .spawn()
        .map_err(|e| format!("yt-dlp execution failed: {e}"))?;

    let mut out = Captured {
        success: false,
        stdout: String::new(),
        stderr: String::new(),
    };
    while let Some(event) = events.recv().await {
        let (bytes, buf) = match event {
            CommandEvent::Stdout(bytes) => (bytes, &mut out.stdout),
            CommandEvent::Stderr(bytes) => (bytes, &mut out.stderr),
            CommandEvent::Terminated(status) => {
                out.success = status.code == Some(0);
                continue;
            }
            CommandEvent::Error(e) => return Err(format!("yt-dlp execution failed: {e}")),
            _ => continue,
        };
        let text = String::from_utf8_lossy(&bytes);
        for line in text.lines() {
            on_line(line);
            buf.push_str(line);
            buf.push('\n');
        }
    }
    Ok(out)
}

/// If the copy in use is older than the newest release, installs that release as the
/// managed copy: in place for a managed copy, or alongside an outdated bundled one, which
/// `locate` then stops using. External copies are left alone. Returns whether it installed.
///
/// This reuses the verified install download instead of `yt-dlp -U`, which goes through
/// GitHub's rate-limited API, skips our checksum check, and can't write to an install dir.
///
/// `interval` is how old the last check must be: it's checked again under the lock, so failed
/// runs that end together (e.g. the live checks of several offline channels) check once.
async fn update(app: &AppHandle, found: &Found, interval: Duration) -> bool {
    if found.source == Source::External {
        return false;
    }
    let (Some(asset), Some(dest)) = (asset_name(), managed_path(app)) else {
        return false;
    };
    let _lock = BINARY.write().await;
    if !update_due(app, interval) {
        return false; // another run just checked
    }
    let Ok(release) = latest_release().await else {
        return false; // e.g. offline; try again next time
    };
    let version_file = version_file(&dest);
    let installed = match found.source {
        Source::Managed => std::fs::read_to_string(&version_file).ok(),
        _ => version_of(app, &found.path).await,
    };
    let outdated = is_outdated(installed.as_deref(), &release.version);
    if outdated && download(&release, asset, &dest, |_, _| {}).await.is_err() {
        return false;
    }
    // The version now in use either way; the file's mtime records when we last checked.
    if let Some(dir) = version_file.parent() {
        std::fs::create_dir_all(dir).ok();
    }
    std::fs::write(&version_file, &release.version).ok();
    outdated
}

/// `yt-dlp --version` of a copy we didn't install. Called with the write lock held, so it
/// doesn't go through `exec`.
async fn version_of(app: &AppHandle, path: &Path) -> Option<String> {
    let output = app
        .shell()
        .command(path)
        .arg("--version")
        .output()
        .await
        .ok()?;
    if !output.status.success() {
        return None;
    }
    parse_version(&String::from_utf8_lossy(&output.stdout))
}

fn parse_version(stdout: &str) -> Option<String> {
    let version = stdout.lines().next()?.trim();
    let valid = !version.is_empty()
        && version
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-');
    valid.then(|| version.to_string())
}

/// A copy whose version is unknown (it wouldn't run, or was never recorded) counts as
/// outdated, so a broken copy gets replaced too.
fn is_outdated(installed: Option<&str>, latest: &str) -> bool {
    installed.map(str::trim) != Some(latest)
}

/// Where yt-dlp is, preferring the app-managed copy: it's kept up to date, unlike a bundled
/// sidecar or an old distro package.
fn locate(app: &AppHandle) -> Option<Found> {
    let found = |path, source| Some(Found { path, source });
    if let Some(path) = managed_path(app).filter(|p| p.is_file()) {
        return found(path, Source::Managed);
    }

    // Dev builds also accept the old sidecar location, so existing setups keep working.
    let dev_sidecar = cfg!(debug_assertions).then(|| {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(format!(
                "yt-dlp-{}{}",
                env!("TAURI_ENV_TARGET_TRIPLE"),
                std::env::consts::EXE_SUFFIX
            ))
    });
    if let Some(path) = dev_sidecar.filter(|p| p.is_file()) {
        return found(path, Source::External);
    }

    // Release builds (made with `--config tauri.bundle-yt-dlp.conf.json`) ship it next to the
    // executable.
    let bundled = std::env::current_exe()
        .ok()
        .and_then(|exe| find_exe(&exe_name(), exe.parent().map(Path::to_path_buf)));
    if let Some(path) = bundled {
        return found(path, Source::Bundled);
    }

    find_exe(&exe_name(), search_dirs()).and_then(|path| found(path, Source::External))
}

/// ffmpeg, if installed. Optional: yt-dlp needs it to merge video and audio above 360p and to
/// embed tags and cover art in downloads.
pub fn locate_ffmpeg() -> Option<PathBuf> {
    find_exe(
        &format!("ffmpeg{}", std::env::consts::EXE_SUFFIX),
        search_dirs(),
    )
}

/// `PATH`, then where Homebrew and pipx install tools: apps launched from Finder/Dock (macOS) or
/// some Linux desktops don't get the shell's PATH.
fn search_dirs() -> impl Iterator<Item = PathBuf> {
    let path_dirs = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect::<Vec<_>>())
        .unwrap_or_default();
    let common_dirs = ["/opt/homebrew/bin", "/usr/local/bin"]
        .map(PathBuf::from)
        .into_iter()
        .chain(dirs::home_dir().map(|home| home.join(".local").join("bin")));
    path_dirs.into_iter().chain(common_dirs)
}

/// The first executable called `name` found in `dirs`, in order.
fn find_exe(name: &str, dirs: impl IntoIterator<Item = PathBuf>) -> Option<PathBuf> {
    dirs.into_iter()
        .map(|dir| dir.join(name))
        .find(|p| p.is_file())
}

fn exe_name() -> String {
    format!("yt-dlp{}", std::env::consts::EXE_SUFFIX)
}

/// The app-managed copy lives in the user-writable data dir, so updates can replace it
/// without admin rights (unlike Program Files or /Applications).
fn managed_path(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_data_dir().ok()?;
    Some(dir.join("bin").join(exe_name()))
}

/// Holds the installed version; its mtime is when updates were last checked.
fn version_file(binary: &Path) -> PathBuf {
    binary.with_file_name("yt-dlp.version")
}

/// The release asset for this platform: a standalone single-file build that needs no Python.
fn asset_name() -> Option<&'static str> {
    let (os, arch, env) = (
        std::env::consts::OS,
        std::env::consts::ARCH,
        cfg!(target_env = "musl"),
    );
    Some(match (os, arch, env) {
        ("windows", "x86_64", _) => "yt-dlp.exe",
        ("windows", "aarch64", _) => "yt-dlp_arm64.exe",
        ("windows", "x86", _) => "yt-dlp_x86.exe",
        ("macos", _, _) => "yt-dlp_macos", // universal: Intel and Apple Silicon
        ("linux", "x86_64", false) => "yt-dlp_linux",
        ("linux", "aarch64", false) => "yt-dlp_linux_aarch64",
        ("linux", "x86_64", true) => "yt-dlp_musllinux",
        ("linux", "aarch64", true) => "yt-dlp_musllinux_aarch64",
        _ => return None,
    })
}

fn client(follow_redirects: bool) -> Result<reqwest::Client, String> {
    // No overall timeout (the download is ~40 MB), but give up on a stalled connection so a
    // background update can't hold the lock and block searches indefinitely.
    let mut builder = reqwest::Client::builder()
        .user_agent(concat!("playmusic/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(15))
        .read_timeout(Duration::from_secs(30));
    if !follow_redirects {
        builder = builder.redirect(reqwest::redirect::Policy::none());
    }
    builder.build().map_err(|e| e.to_string())
}

/// The newest release, read from where `releases/latest` redirects to. Pinning it means the
/// checksum file and the binary always come from the same release, and it's a plain web
/// request rather than a call to GitHub's rate-limited API.
async fn latest_release() -> Result<Release, String> {
    let response = client(false)?
        .get(format!("{RELEASES}/latest/download/SHA2-256SUMS"))
        .send()
        .await
        .map_err(|e| format!("couldn't reach GitHub: {e}"))?;
    response
        .headers()
        .get(reqwest::header::LOCATION)
        .and_then(|v| v.to_str().ok())
        .and_then(parse_release)
        .ok_or_else(|| "couldn't resolve the latest yt-dlp release".to_string())
}

/// Parses `https://github.com/yt-dlp/yt-dlp/releases/download/<version>/SHA2-256SUMS`.
/// Anything outside the official repo is rejected.
fn parse_release(location: &str) -> Option<Release> {
    let url = location.strip_suffix("/SHA2-256SUMS")?;
    let version = url.strip_prefix(&format!("{RELEASES}/download/"))?;
    let valid = !version.is_empty()
        && version
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-');
    valid.then(|| Release {
        url: url.to_string(),
        version: version.to_string(),
    })
}

/// Downloads `asset` from `release` and installs it at `dest` if it matches the release's
/// SHA2-256SUMS.
async fn download(
    release: &Release,
    asset: &str,
    dest: &Path,
    on_progress: impl Fn(u64, Option<u64>),
) -> Result<(), String> {
    let client = client(true)?;
    let get = |url: String| {
        let request = client.get(url).send();
        async move {
            request
                .await
                .and_then(|r| r.error_for_status())
                .map_err(|e| format!("download failed: {e}"))
        }
    };

    let sums = get(format!("{}/SHA2-256SUMS", release.url))
        .await?
        .text()
        .await
        .map_err(|e| e.to_string())?;
    let expected = expected_sha256(&sums, asset).ok_or("asset missing from SHA2-256SUMS")?;

    let mut response = get(format!("{}/{asset}", release.url)).await?;
    let total = response.content_length();
    let mut data = Vec::with_capacity(total.unwrap_or(0) as usize);
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        data.extend_from_slice(&chunk);
        on_progress(data.len() as u64, total);
    }

    store_verified(&data, &expected, dest)
}

/// The hash for `asset` in a `sha256sum`-style file (`<hex>  <name>` per line).
fn expected_sha256(sums: &str, asset: &str) -> Option<String> {
    sums.lines().find_map(|line| {
        let (hash, name) = line.split_once(char::is_whitespace)?;
        (name.trim().trim_start_matches('*') == asset).then(|| hash.to_ascii_lowercase())
    })
}

/// Writes `data` to `dest` only if it matches `expected_sha256`. Writes to a temp file and
/// renames it into place, so a failed download never leaves a half-written binary.
fn store_verified(data: &[u8], expected_sha256: &str, dest: &Path) -> Result<(), String> {
    let actual: String = Sha256::digest(data)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    if !actual.eq_ignore_ascii_case(expected_sha256) {
        return Err(format!(
            "checksum mismatch for yt-dlp (expected {expected_sha256}, got {actual})"
        ));
    }

    let dir = dest.parent().ok_or("invalid install path")?;
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let tmp = dir.join("yt-dlp.download");
    std::fs::write(&tmp, data).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| e.to_string())?;
    }
    std::fs::rename(&tmp, dest).map_err(|e| e.to_string())
}

fn is_due(marker: &Path, interval: Duration) -> bool {
    let last = std::fs::metadata(marker).and_then(|m| m.modified()).ok();
    is_older_than(last, interval, SystemTime::now())
}

fn is_older_than(last: Option<SystemTime>, interval: Duration, now: SystemTime) -> bool {
    match last {
        Some(t) => now.duration_since(t).is_ok_and(|age| age >= interval),
        None => true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    const SUMS: &str = "\
0a1b2c  yt-dlp
DEADBEEF  yt-dlp.exe
ffff *yt-dlp_macos
1234  yt-dlp_linux.zip
";

    #[test]
    fn finds_yt_dlp_in_the_first_dir_that_has_it() {
        let empty = TempDir::new().unwrap();
        let first = TempDir::new().unwrap();
        let second = TempDir::new().unwrap();
        std::fs::write(first.path().join(exe_name()), b"").unwrap();
        std::fs::write(second.path().join(exe_name()), b"").unwrap();

        let dirs = [empty.path(), first.path(), second.path()].map(Path::to_path_buf);
        assert_eq!(
            find_exe(&exe_name(), dirs),
            Some(first.path().join(exe_name()))
        );
    }

    #[test]
    fn missing_yt_dlp_is_none() {
        let empty = TempDir::new().unwrap();
        let dirs = [
            empty.path().to_path_buf(),
            empty.path().join("does-not-exist"),
        ];
        assert_eq!(find_exe(&exe_name(), dirs), None);
        assert_eq!(find_exe(&exe_name(), Vec::new()), None);
    }

    #[test]
    fn a_directory_named_yt_dlp_is_not_a_match() {
        let dir = TempDir::new().unwrap();
        std::fs::create_dir(dir.path().join(exe_name())).unwrap();
        assert_eq!(find_exe(&exe_name(), [dir.path().to_path_buf()]), None);
    }

    #[test]
    fn this_platform_has_a_standalone_asset() {
        // CI and dev machines are all on supported platforms.
        let asset = asset_name().expect("supported platform");
        assert!(!asset.ends_with(".zip"));
        assert_eq!(asset.ends_with(".exe"), cfg!(windows));
    }

    #[test]
    fn expected_sha256_matches_exact_asset_names() {
        assert_eq!(expected_sha256(SUMS, "yt-dlp"), Some("0a1b2c".into()));
        assert_eq!(expected_sha256(SUMS, "yt-dlp.exe"), Some("deadbeef".into()));
        assert_eq!(expected_sha256(SUMS, "yt-dlp_macos"), Some("ffff".into()));
        assert_eq!(expected_sha256(SUMS, "yt-dlp_linux"), None, "not the .zip");
        assert_eq!(expected_sha256("", "yt-dlp"), None);
    }

    #[test]
    fn release_comes_from_the_official_redirect_only() {
        let url = "https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19";
        assert_eq!(
            parse_release(&format!("{url}/SHA2-256SUMS")),
            Some(Release {
                url: url.into(),
                version: "2026.08.19".into()
            })
        );
        for bad in [
            "https://release-assets.githubusercontent.com/x/SHA2-256SUMS",
            "https://github.com/evil/yt-dlp/releases/download/2026.08.19/SHA2-256SUMS",
            "https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp",
            "https://github.com/yt-dlp/yt-dlp/releases/download//SHA2-256SUMS",
            "https://github.com/yt-dlp/yt-dlp/releases/download/../x/SHA2-256SUMS",
        ] {
            assert_eq!(parse_release(bad), None, "{bad}");
        }
    }

    #[test]
    fn store_verified_installs_matching_data() {
        let dir = TempDir::new().unwrap();
        let dest = dir.path().join("bin").join(exe_name());
        // sha256("hello")
        let hash = "2CF24DBA5FB0A30E26E83B2AC5B9E29E1B161E5C1FA7425E73043362938B9824";

        store_verified(b"hello", hash, &dest).unwrap();
        assert_eq!(std::fs::read(&dest).unwrap(), b"hello");
        assert!(!dest.with_file_name("yt-dlp.download").exists());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&dest).unwrap().permissions().mode();
            assert_eq!(mode & 0o111, 0o111, "executable");
        }
    }

    #[test]
    fn store_verified_rejects_a_checksum_mismatch() {
        let dir = TempDir::new().unwrap();
        let dest = dir.path().join(exe_name());
        let err = store_verified(b"tampered", "00", &dest).unwrap_err();
        assert!(err.contains("checksum mismatch"), "{err}");
        assert!(!dest.exists());
    }

    #[test]
    fn store_verified_replaces_an_existing_binary() {
        let dir = TempDir::new().unwrap();
        let dest = dir.path().join(exe_name());
        std::fs::write(&dest, b"old").unwrap();
        let hash = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
        store_verified(b"hello", hash, &dest).unwrap();
        assert_eq!(std::fs::read(&dest).unwrap(), b"hello");
    }

    #[test]
    fn update_is_due_when_never_run_or_stale() {
        let now = SystemTime::now();
        let hour = Duration::from_secs(3600);
        assert!(is_older_than(None, hour, now));
        assert!(is_older_than(Some(now - 2 * hour), hour, now));
        assert!(!is_older_than(Some(now - hour / 2), hour, now));
        // A clock that went backwards doesn't trigger an update storm.
        assert!(!is_older_than(Some(now + hour), hour, now));
    }

    #[test]
    fn parses_yt_dlp_version_output() {
        assert_eq!(parse_version("2026.08.19\n"), Some("2026.08.19".into()));
        assert_eq!(
            parse_version("  2026.08.19  \r\nextra"),
            Some("2026.08.19".into())
        );
        assert_eq!(parse_version(""), None);
        assert_eq!(parse_version("\n2026.08.19"), None);
        assert_eq!(parse_version("ERROR: something"), None);
    }

    #[test]
    fn unknown_or_different_versions_are_outdated() {
        assert!(!is_outdated(Some("2026.08.19"), "2026.08.19"));
        assert!(!is_outdated(Some("2026.08.19\n"), "2026.08.19"));
        assert!(is_outdated(Some("2024.12.23"), "2026.08.19"));
        assert!(
            is_outdated(None, "2026.08.19"),
            "a copy that won't run gets replaced"
        );
    }

    #[test]
    fn version_file_sits_next_to_the_binary() {
        let path = Path::new("/data/bin").join(exe_name());
        assert_eq!(version_file(&path), Path::new("/data/bin/yt-dlp.version"));
    }
}
