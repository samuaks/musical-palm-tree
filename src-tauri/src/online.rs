use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri_plugin_shell::ShellExt;

const NOT_FOUND: &str = "yt-dlp not found: install it and make sure it's on PATH, \
     or place it next to the playmusic executable";

#[derive(Debug, Serialize)]
pub struct OnlineSearchResult {
    pub video_id: String,
    pub title: String,
    pub duration_secs: f64,
    pub thumbnail: Option<String>,
    pub uploader: Option<String>,
}

// What yt-dlp emits per line with --dump-json --flat-playlist
#[derive(Debug, Deserialize)]
struct YtDlpFlatEntry {
    id: String,
    title: String,
    duration: Option<f64>,
    thumbnails: Option<Vec<YtDlpThumbnail>>,
    uploader: Option<String>,
    channel: Option<String>,
}

#[derive(Debug, Deserialize)]
struct YtDlpThumbnail {
    url: String,
    width: Option<u32>,
}

/// Whether the Online space can work, i.e. yt-dlp is installed. The frontend hides the
/// space when it isn't, so the app runs local-only without it.
#[tauri::command]
pub fn online_available() -> bool {
    yt_dlp().is_some()
}

/// yt-dlp is optional and looked up at runtime instead of being a required Tauri sidecar.
/// The lookup is a few `stat` calls, so it isn't cached.
fn yt_dlp() -> Option<PathBuf> {
    // Builds made with `--config tauri.bundle-yt-dlp.conf.json` ship it next to the exe.
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(Path::to_path_buf));
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
    let path_dirs = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect::<Vec<_>>())
        .unwrap_or_default();
    // Apps launched from Finder/Dock (macOS) or some Linux desktops don't get the shell's PATH,
    // so also try where Homebrew and pipx install it.
    let common_dirs = ["/opt/homebrew/bin", "/usr/local/bin"]
        .map(PathBuf::from)
        .into_iter()
        .chain(dirs::home_dir().map(|home| home.join(".local").join("bin")));

    dev_sidecar
        .filter(|p| p.is_file())
        .or_else(|| find_yt_dlp(exe_dir.into_iter().chain(path_dirs).chain(common_dirs)))
}

/// The first `yt-dlp` executable found in `dirs`, in order.
fn find_yt_dlp(dirs: impl IntoIterator<Item = PathBuf>) -> Option<PathBuf> {
    let name = format!("yt-dlp{}", std::env::consts::EXE_SUFFIX);
    dirs.into_iter()
        .map(|dir| dir.join(&name))
        .find(|p| p.is_file())
}

#[tauri::command]
pub async fn search_online(
    app: tauri::AppHandle,
    query: String,
) -> Result<Vec<OnlineSearchResult>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let search_arg = format!("ytsearch10:{}", query);

    let output = app
        .shell()
        .command(yt_dlp().ok_or(NOT_FOUND)?)
        .args([
            "--dump-json",
            "--flat-playlist",
            "--no-warnings",
            "--no-playlist",
            &search_arg,
        ])
        .output()
        .await
        .map_err(|e| format!("yt-dlp execution failed: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("yt-dlp exited with error: {stderr}"));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let results = stdout
        .lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| serde_json::from_str::<YtDlpFlatEntry>(line).ok())
        .map(|entry| OnlineSearchResult {
            video_id: entry.id,
            title: entry.title,
            duration_secs: entry.duration.unwrap_or(0.0),
            thumbnail: pick_thumbnail(entry.thumbnails),
            uploader: entry.uploader.or(entry.channel),
        })
        .collect();

    Ok(results)
}

#[tauri::command]
pub async fn resolve_stream(app: tauri::AppHandle, video_id: String) -> Result<String, String> {
    let url = format!("https://www.youtube.com/watch?v={video_id}");

    let output = app
        .shell()
        .command(yt_dlp().ok_or(NOT_FOUND)?)
        .args([
            "-f",
            "bestaudio",
            "--get-url",
            "--no-warnings",
            "--no-playlist",
            &url,
        ])
        .output()
        .await
        .map_err(|e| format!("yt-dlp execution failed: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("yt-dlp exited with error: {stderr}"));
    }

    let stream_url = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if stream_url.is_empty() {
        return Err("yt-dlp returned empty stream URL".to_string());
    }

    Ok(stream_url)
}

/// Pick a reasonable thumbnail — prefer medium-sized ones, fall back to first or none.
fn pick_thumbnail(thumbnails: Option<Vec<YtDlpThumbnail>>) -> Option<String> {
    let mut thumbs = thumbnails?;
    if thumbs.is_empty() {
        return None;
    }
    // Sort: thumbnails with known width come first, ordered by closeness to ~320px.
    // Falls back to first thumbnail if none have widths.
    thumbs.sort_by_key(|t| match t.width {
        Some(w) => (0u8, (w as i32 - 320).abs()),
        None => (1u8, 0),
    });
    thumbs.into_iter().next().map(|t| t.url)
}
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn exe_name() -> String {
        format!("yt-dlp{}", std::env::consts::EXE_SUFFIX)
    }

    #[test]
    fn finds_yt_dlp_in_the_first_dir_that_has_it() {
        let empty = TempDir::new().unwrap();
        let first = TempDir::new().unwrap();
        let second = TempDir::new().unwrap();
        std::fs::write(first.path().join(exe_name()), b"").unwrap();
        std::fs::write(second.path().join(exe_name()), b"").unwrap();

        let dirs = [empty.path(), first.path(), second.path()].map(Path::to_path_buf);
        assert_eq!(find_yt_dlp(dirs), Some(first.path().join(exe_name())));
    }

    #[test]
    fn missing_yt_dlp_is_none() {
        let empty = TempDir::new().unwrap();
        let dirs = [
            empty.path().to_path_buf(),
            empty.path().join("does-not-exist"),
        ];
        assert_eq!(find_yt_dlp(dirs), None);
        assert_eq!(find_yt_dlp(Vec::new()), None);
    }

    #[test]
    fn a_directory_named_yt_dlp_is_not_a_match() {
        let dir = TempDir::new().unwrap();
        std::fs::create_dir(dir.path().join(exe_name())).unwrap();
        assert_eq!(find_yt_dlp([dir.path().to_path_buf()]), None);
    }
}
