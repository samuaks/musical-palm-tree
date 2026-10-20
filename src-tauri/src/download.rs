//! Downloads YouTube audio or video into the scanned folders, so it shows up in the local
//! library: `~/Music/YouTube` and `~/Videos/YouTube` (album "YouTube").

use crate::ytdlp;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Copy, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Audio,
    Video,
}

#[derive(Debug, Serialize)]
pub struct Downloaded {
    path: String,
    kind: Kind,
}

#[derive(Serialize, Clone)]
struct DownloadProgress {
    video_id: String,
    kind: Kind,
    downloaded: u64,
    total: Option<u64>,
}

const PROGRESS_EVERY: Duration = Duration::from_millis(250);
const PROGRESS_PREFIX: &str = "PROGRESS ";
/// What downloads are saved as: both play in every WebView and are picked up by the scanner.
const EXTS: [&str; 2] = ["m4a", "mp4"];

/// Downloads a video's audio (m4a) or video (mp4) unless it's already there, and returns the
/// file's path. Emits `download_progress` events while it runs.
#[tauri::command]
pub async fn download_media(
    app: AppHandle,
    video_id: String,
    kind: Kind,
) -> Result<Downloaded, String> {
    if !is_video_id(&video_id) {
        return Err(format!("not a YouTube video id: {video_id}"));
    }
    let home = dirs::home_dir().ok_or("no home directory")?;
    let dir = target_dir(&home, kind);
    if let Some(path) = find_existing(&dir, &video_id) {
        return Ok(downloaded(path, kind));
    }
    std::fs::create_dir_all(&dir).map_err(|e| format!("couldn't create {}: {e}", dir.display()))?;

    let url = format!("https://www.youtube.com/watch?v={video_id}");
    let args = download_args(kind, ytdlp::locate_ffmpeg().as_deref(), &dir, &url);
    let args: Vec<&str> = args.iter().map(String::as_str).collect();

    let mut last_emit: Option<Instant> = None;
    ytdlp::run_streaming(&app, &args, |line| {
        let Some((downloaded, total)) = parse_progress(line) else {
            return;
        };
        let finished = total.is_some_and(|total| downloaded >= total);
        if !finished && last_emit.is_some_and(|t| t.elapsed() < PROGRESS_EVERY) {
            return;
        }
        last_emit = Some(Instant::now());
        let progress = DownloadProgress {
            video_id: video_id.clone(),
            kind,
            downloaded,
            total,
        };
        app.emit("download_progress", progress).ok();
    })
    .await?;

    // Found by name rather than from yt-dlp's printed path, which Windows consoles can mangle
    // for non-ASCII titles.
    find_existing(&dir, &video_id)
        .map(|path| downloaded(path, kind))
        .ok_or_else(|| "yt-dlp finished but the downloaded file wasn't found".to_string())
}

fn downloaded(path: PathBuf, kind: Kind) -> Downloaded {
    Downloaded {
        path: path.to_string_lossy().into_owned(),
        kind,
    }
}

/// YouTube ids are letters, digits, `-` and `_`. Checked because the id ends up in a URL and
/// a file name.
fn is_video_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// One level below an allowed scan dir, so the scanner lists downloads as album "YouTube".
fn target_dir(home: &Path, kind: Kind) -> PathBuf {
    let top = match kind {
        Kind::Audio => "Music",
        Kind::Video => "Videos",
    };
    home.join(top).join("YouTube")
}

/// A finished download of `video_id` in `dir`: saved as `<title> [<id>].<ext>`. Partial files
/// (`.part`) and unmerged parts (`.f137.mp4`) don't match.
fn find_existing(dir: &Path, video_id: &str) -> Option<PathBuf> {
    let suffixes = EXTS.map(|ext| format!("[{video_id}].{ext}"));
    std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .map(|entry| entry.path())
        .find(|path| {
            path.is_file()
                && path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| suffixes.iter().any(|s| name.ends_with(s.as_str())))
        })
}

/// yt-dlp arguments for a download. With ffmpeg: up to 1080p video merged with its audio, and
/// title/artist/cover embedded. Without it: the m4a audio stream as is, or the 360p stream that
/// has both picture and sound (format 18).
fn download_args(kind: Kind, ffmpeg: Option<&Path>, dir: &Path, url: &str) -> Vec<String> {
    let mut args: Vec<String> = [
        "--no-playlist",
        "--no-warnings",
        "--newline",
        "--progress-template",
        "download:PROGRESS %(progress.downloaded_bytes)s %(progress.total_bytes)s \
         %(progress.total_bytes_estimate)s",
        "-o",
        "%(title)s [%(id)s].%(ext)s",
    ]
    .map(String::from)
    .into();
    args.extend(["-P".into(), dir.to_string_lossy().into_owned()]);

    let format: &[&str] = match (kind, ffmpeg.is_some()) {
        (Kind::Audio, true) => &["-f", "ba[ext=m4a]/ba", "-x", "--audio-format", "m4a"],
        // Only m4a: a webm/opus file would be listed as a video.
        (Kind::Audio, false) => &["-f", "ba[ext=m4a]"],
        (Kind::Video, true) => &[
            "-f",
            "bv*[height<=1080][vcodec^=avc1]+ba[ext=m4a]/b[ext=mp4]",
            "--merge-output-format",
            "mp4",
        ],
        (Kind::Video, false) => &["-f", "18/b[ext=mp4][vcodec!=none][acodec!=none]"],
    };
    args.extend(format.iter().map(|s| s.to_string()));

    if let Some(ffmpeg) = ffmpeg {
        args.extend([
            "--ffmpeg-location".into(),
            ffmpeg.to_string_lossy().into_owned(),
            "--embed-metadata".into(),
            "--embed-thumbnail".into(),
        ]);
    }
    args.push(url.to_string());
    args
}

/// Reads a `PROGRESS <downloaded> <total> <estimate>` line from our progress template. yt-dlp
/// prints `NA` for unknown values; the total falls back to the estimate.
fn parse_progress(line: &str) -> Option<(u64, Option<u64>)> {
    let mut fields = line
        .trim()
        .strip_prefix(PROGRESS_PREFIX)?
        .split_whitespace()
        .map(|field| {
            field
                .parse::<f64>()
                .ok()
                .filter(|n| n.is_finite() && *n >= 0.0)
        });
    let downloaded = fields.next()?? as u64;
    let total = fields.next().flatten();
    let estimate = fields.next().flatten();
    Some((downloaded, total.or(estimate).map(|n| n as u64)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn args(kind: Kind, ffmpeg: Option<&Path>) -> Vec<String> {
        download_args(
            kind,
            ffmpeg,
            Path::new("/home/u/Music/YouTube"),
            "https://y/watch?v=abc",
        )
    }

    fn value_of<'a>(args: &'a [String], flag: &str) -> Option<&'a str> {
        let i = args.iter().position(|a| a == flag)?;
        args.get(i + 1).map(String::as_str)
    }

    #[test]
    fn audio_with_ffmpeg_extracts_m4a_and_embeds_tags() {
        let ffmpeg = Path::new("/usr/bin/ffmpeg");
        let a = args(Kind::Audio, Some(ffmpeg));
        assert_eq!(value_of(&a, "-f"), Some("ba[ext=m4a]/ba"));
        assert_eq!(value_of(&a, "--audio-format"), Some("m4a"));
        assert_eq!(value_of(&a, "--ffmpeg-location"), Some("/usr/bin/ffmpeg"));
        assert!(a.contains(&"--embed-thumbnail".to_string()));
        assert_eq!(a.last().map(String::as_str), Some("https://y/watch?v=abc"));
    }

    #[test]
    fn audio_without_ffmpeg_only_takes_m4a() {
        let a = args(Kind::Audio, None);
        assert_eq!(value_of(&a, "-f"), Some("ba[ext=m4a]"));
        assert!(!a.iter().any(|x| x.starts_with("--embed") || x == "-x"));
        assert!(!a.contains(&"--ffmpeg-location".to_string()));
    }

    #[test]
    fn video_merges_up_to_1080p_with_ffmpeg_and_falls_back_to_360p() {
        let a = args(Kind::Video, Some(Path::new("ffmpeg")));
        assert!(value_of(&a, "-f").unwrap().starts_with("bv*[height<=1080]"));
        assert_eq!(value_of(&a, "--merge-output-format"), Some("mp4"));

        let a = args(Kind::Video, None);
        assert!(value_of(&a, "-f").unwrap().starts_with("18/"));
        assert!(!a.contains(&"--merge-output-format".to_string()));
    }

    #[test]
    fn files_are_named_by_title_and_id_in_the_target_dir() {
        let a = args(Kind::Audio, None);
        assert_eq!(value_of(&a, "-o"), Some("%(title)s [%(id)s].%(ext)s"));
        assert_eq!(value_of(&a, "-P"), Some("/home/u/Music/YouTube"));
        let template = value_of(&a, "--progress-template").unwrap();
        assert!(!template.contains("  "), "one line: {template}");
    }

    #[test]
    fn parses_progress_lines() {
        assert_eq!(
            parse_progress("PROGRESS 1024 4096 NA"),
            Some((1024, Some(4096)))
        );
        assert_eq!(
            parse_progress("PROGRESS 1024 NA 5000.7"),
            Some((1024, Some(5000)))
        );
        assert_eq!(parse_progress("  PROGRESS 10 NA NA\r"), Some((10, None)));
        assert_eq!(parse_progress("PROGRESS NA NA NA"), None);
        assert_eq!(parse_progress("[download] Destination: x.m4a"), None);
        assert_eq!(parse_progress(""), None);
    }

    #[test]
    fn finds_only_finished_downloads_of_that_video() {
        let dir = TempDir::new().unwrap();
        let file = |name: &str| std::fs::write(dir.path().join(name), b"").unwrap();
        file("Song [abc].m4a.part");
        file("Clip [abc].f137.mp4");
        file("Other [xyz].m4a");
        assert_eq!(find_existing(dir.path(), "abc"), None);

        file("Song [abc].m4a");
        assert_eq!(
            find_existing(dir.path(), "abc"),
            Some(dir.path().join("Song [abc].m4a"))
        );
        assert_eq!(find_existing(&dir.path().join("missing"), "abc"), None);
    }

    #[test]
    fn video_ids_are_validated() {
        assert!(is_video_id("dQw4w9WgXcQ"));
        assert!(is_video_id("a-b_c"));
        assert!(!is_video_id(""));
        assert!(!is_video_id("--exec rm"));
        assert!(!is_video_id("../x"));
    }

    #[test]
    fn audio_goes_to_music_and_video_to_videos() {
        let home = Path::new("/home/u");
        assert_eq!(
            target_dir(home, Kind::Audio),
            home.join("Music").join("YouTube")
        );
        assert_eq!(
            target_dir(home, Kind::Video),
            home.join("Videos").join("YouTube")
        );
    }
}
