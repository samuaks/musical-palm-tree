//! Downloads YouTube or Twitch audio and video into the scanned folders, so they show up in the
//! local library: `~/{Music,Videos}/YouTube` and `~/{Music,Videos}/Twitch` (albums "YouTube" and
//! "Twitch").

use crate::online::{media_url, Platform};
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
    platform: Platform,
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
    platform: Platform,
    video_id: String,
    kind: Kind,
) -> Result<Downloaded, String> {
    if video_id.starts_with("live:") {
        return Err("recording live streams isn't supported".to_string());
    }
    let url =
        media_url(platform, &video_id).ok_or_else(|| format!("not a video id: {video_id}"))?;
    let file_id = file_id(platform, &video_id);
    let home = dirs::home_dir().ok_or("no home directory")?;
    let dir = target_dir(&home, platform, kind);
    if let Some(path) = find_existing(&dir, &file_id) {
        return Ok(downloaded(path, kind));
    }
    std::fs::create_dir_all(&dir).map_err(|e| format!("couldn't create {}: {e}", dir.display()))?;

    let args = download_args(
        platform,
        kind,
        ytdlp::locate_ffmpeg().as_deref(),
        &dir,
        &url,
    );
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
            platform,
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
    find_existing(&dir, &file_id)
        .map(|path| downloaded(path, kind))
        .ok_or_else(|| "yt-dlp finished but the downloaded file wasn't found".to_string())
}

fn downloaded(path: PathBuf, kind: Kind) -> Downloaded {
    Downloaded {
        path: path.to_string_lossy().into_owned(),
        kind,
    }
}

/// The id as yt-dlp writes it into file names (`%(id)s`): Twitch VOD ids get a `v` prefix.
fn file_id(platform: Platform, id: &str) -> String {
    match platform {
        Platform::Youtube => id.to_string(),
        Platform::Twitch => format!("v{}", id.trim_start_matches('v')),
    }
}

/// One level below an allowed scan dir, so the scanner lists downloads as album "YouTube" or
/// "Twitch".
fn target_dir(home: &Path, platform: Platform, kind: Kind) -> PathBuf {
    let top = match kind {
        Kind::Audio => "Music",
        Kind::Video => "Videos",
    };
    let album = match platform {
        Platform::Youtube => "YouTube",
        Platform::Twitch => "Twitch",
    };
    home.join(top).join(album)
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

/// yt-dlp arguments for a download.
///
/// YouTube, with ffmpeg: up to 1080p video merged with its audio, and title/artist/cover
/// embedded. Without it: the m4a audio stream as is, or the 360p stream that has both picture
/// and sound (format 18).
///
/// Twitch only serves HLS, and every quality has sound, so video is one stream up to 720p
/// (~1.3 GB per hour of VOD) and audio is the Audio_Only rendition (~90 MB per hour). VODs are
/// thousands of 10 s fragments, fetched 8 at a time.
fn download_args(
    platform: Platform,
    kind: Kind,
    ffmpeg: Option<&Path>,
    dir: &Path,
    url: &str,
) -> Vec<String> {
    // Twitch's Audio_Only is already AAC in MP4; without ffmpeg to remux it, name it .m4a so it
    // isn't listed as a video.
    let output = if platform == Platform::Twitch && kind == Kind::Audio && ffmpeg.is_none() {
        "%(title)s [%(id)s].m4a"
    } else {
        "%(title)s [%(id)s].%(ext)s"
    };
    let mut args: Vec<String> = [
        "--no-playlist",
        "--no-warnings",
        "--newline",
        "--progress-template",
        "download:PROGRESS %(progress.downloaded_bytes)s %(progress.total_bytes)s \
         %(progress.total_bytes_estimate)s",
        "-o",
        output,
    ]
    .map(String::from)
    .into();
    args.extend(["-P".into(), dir.to_string_lossy().into_owned()]);

    let format: &[&str] = match (platform, kind, ffmpeg.is_some()) {
        (Platform::Youtube, Kind::Audio, true) => {
            &["-f", "ba[ext=m4a]/ba", "-x", "--audio-format", "m4a"]
        }
        // Only m4a: a webm/opus file would be listed as a video.
        (Platform::Youtube, Kind::Audio, false) => &["-f", "ba[ext=m4a]"],
        (Platform::Youtube, Kind::Video, true) => &[
            "-f",
            "bv*[height<=1080][vcodec^=avc1]+ba[ext=m4a]/b[ext=mp4]",
            "--merge-output-format",
            "mp4",
        ],
        (Platform::Youtube, Kind::Video, false) => {
            &["-f", "18/b[ext=mp4][vcodec!=none][acodec!=none]"]
        }
        (Platform::Twitch, Kind::Audio, true) => {
            &["-N", "8", "-f", "ba/b", "-x", "--audio-format", "m4a"]
        }
        (Platform::Twitch, Kind::Audio, false) => &["-N", "8", "-f", "ba/b"],
        (Platform::Twitch, Kind::Video, _) => &["-N", "8", "-f", "b[height<=720]/b"],
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
            Platform::Youtube,
            kind,
            ffmpeg,
            Path::new("/home/u/Music/YouTube"),
            "https://y/watch?v=abc",
        )
    }

    fn twitch_args(kind: Kind, ffmpeg: Option<&Path>) -> Vec<String> {
        download_args(
            Platform::Twitch,
            kind,
            ffmpeg,
            Path::new("/home/u/Music/Twitch"),
            "https://www.twitch.tv/videos/1",
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
    fn twitch_audio_is_the_audio_only_rendition_as_m4a() {
        let a = twitch_args(Kind::Audio, Some(Path::new("ffmpeg")));
        assert_eq!(value_of(&a, "-f"), Some("ba/b"));
        assert_eq!(value_of(&a, "--audio-format"), Some("m4a"));
        assert_eq!(value_of(&a, "-o"), Some("%(title)s [%(id)s].%(ext)s"));
        assert_eq!(value_of(&a, "-N"), Some("8"), "fragments in parallel");

        // Without ffmpeg there's no remux, so the .m4a name is set directly
        let a = twitch_args(Kind::Audio, None);
        assert_eq!(value_of(&a, "-o"), Some("%(title)s [%(id)s].m4a"));
        assert!(!a.contains(&"-x".to_string()));
    }

    #[test]
    fn twitch_video_is_one_stream_up_to_720p() {
        for ffmpeg in [None, Some(Path::new("ffmpeg"))] {
            let a = twitch_args(Kind::Video, ffmpeg);
            assert_eq!(value_of(&a, "-f"), Some("b[height<=720]/b"));
            assert!(!a.contains(&"--merge-output-format".to_string()));
            assert_eq!(value_of(&a, "-o"), Some("%(title)s [%(id)s].%(ext)s"));
        }
    }

    #[test]
    fn twitch_file_ids_have_the_v_prefix() {
        assert_eq!(file_id(Platform::Twitch, "2905135575"), "v2905135575");
        assert_eq!(file_id(Platform::Twitch, "v2905135575"), "v2905135575");
        assert_eq!(file_id(Platform::Youtube, "dQw4w9WgXcQ"), "dQw4w9WgXcQ");
    }

    #[test]
    fn downloads_go_to_an_album_per_platform() {
        let home = Path::new("/home/u");
        assert_eq!(
            target_dir(home, Platform::Youtube, Kind::Audio),
            home.join("Music").join("YouTube")
        );
        assert_eq!(
            target_dir(home, Platform::Youtube, Kind::Video),
            home.join("Videos").join("YouTube")
        );
        assert_eq!(
            target_dir(home, Platform::Twitch, Kind::Audio),
            home.join("Music").join("Twitch")
        );
        assert_eq!(
            target_dir(home, Platform::Twitch, Kind::Video),
            home.join("Videos").join("Twitch")
        );
    }
}
