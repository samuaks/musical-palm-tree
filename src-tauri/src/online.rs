use crate::ytdlp;
use serde::{Deserialize, Serialize};

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

#[tauri::command]
pub async fn search_online(
    app: tauri::AppHandle,
    query: String,
) -> Result<Vec<OnlineSearchResult>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let search_arg = format!("ytsearch10:{}", query);

    let stdout = ytdlp::run(
        &app,
        &[
            "--dump-json",
            "--flat-playlist",
            "--no-warnings",
            "--no-playlist",
            &search_arg,
        ],
    )
    .await?;

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

/// Playable URLs for one video. With video, the frontend plays `video_url` muted in a `<video>`
/// and keeps it in sync with `audio_url`, which plays in an `<audio>`.
#[derive(Debug, Serialize, PartialEq)]
pub struct ResolvedStream {
    pub audio_url: String,
    pub video_url: Option<String>,
    pub height: Option<u32>,
}

// What yt-dlp emits with --dump-json for the selected format(s): a merged pick (video+audio)
// lists both under `requested_formats`, a single format has its fields at the top level.
#[derive(Debug, Deserialize)]
struct YtDlpResolved {
    #[serde(flatten)]
    format: YtDlpFormat,
    requested_formats: Option<Vec<YtDlpFormat>>,
}

#[derive(Debug, Deserialize)]
struct YtDlpFormat {
    url: Option<String>,
    vcodec: Option<String>,
    acodec: Option<String>,
    height: Option<u32>,
}

impl YtDlpFormat {
    fn is_video_only(&self) -> bool {
        let has = |codec: &Option<String>| codec.as_deref().is_some_and(|c| c != "none");
        has(&self.vcodec) && !has(&self.acodec)
    }
}

/// Only YouTube's 360p format has picture and sound in one stream, so better video is a
/// video-only stream plus an audio stream. avc1 first because every WebView decodes it, https
/// only because WebView2 can't play HLS (m3u8), and audio only if there's no usable video.
const VIDEO_FORMAT: &str =
    "bv[height<=1080][vcodec^=avc1][protocol=https]+ba[ext=m4a][protocol=https]\
     /bv[height<=1080][protocol=https]+ba[protocol=https]/ba";
/// m4a (AAC) plays in WebKit too, unlike some opus/webm streams.
const AUDIO_FORMAT: &str = "ba[ext=m4a]/ba";

#[tauri::command]
pub async fn resolve_stream(
    app: tauri::AppHandle,
    video_id: String,
    video: bool,
) -> Result<ResolvedStream, String> {
    let url = format!("https://www.youtube.com/watch?v={video_id}");
    let format = if video { VIDEO_FORMAT } else { AUDIO_FORMAT };

    let stdout = ytdlp::run(
        &app,
        &[
            "-f",
            format,
            "--dump-json",
            "--no-warnings",
            "--no-playlist",
            &url,
        ],
    )
    .await?;

    parse_resolved(&stdout)
}

fn parse_resolved(stdout: &str) -> Result<ResolvedStream, String> {
    let line = stdout
        .lines()
        .find(|line| !line.trim().is_empty())
        .ok_or("yt-dlp returned nothing")?;
    let resolved: YtDlpResolved =
        serde_json::from_str(line).map_err(|e| format!("couldn't read yt-dlp output: {e}"))?;
    let formats = resolved
        .requested_formats
        .unwrap_or_else(|| vec![resolved.format]);

    let video = formats.iter().find(|f| f.is_video_only());
    let audio_url = formats
        .iter()
        .find(|f| !f.is_video_only())
        .and_then(|f| f.url.clone())
        .ok_or("yt-dlp returned no audio stream URL")?;

    Ok(ResolvedStream {
        audio_url,
        video_url: video.and_then(|f| f.url.clone()),
        height: video.and_then(|f| f.height),
    })
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

    #[test]
    fn merged_pick_returns_video_and_audio_urls() {
        let json = r#"{"id":"x","title":"t","url":null,"requested_formats":[
            {"format_id":"137","url":"https://v/137","vcodec":"avc1.640028","acodec":"none","height":1080},
            {"format_id":"140","url":"https://a/140","vcodec":"none","acodec":"mp4a.40.2","height":null}
        ]}"#
        .replace('\n', "");
        assert_eq!(
            parse_resolved(&json),
            Ok(ResolvedStream {
                audio_url: "https://a/140".into(),
                video_url: Some("https://v/137".into()),
                height: Some(1080),
            })
        );
    }

    #[test]
    fn single_audio_format_has_no_video() {
        let json = r#"{"id":"x","url":"https://a/140","vcodec":"none","acodec":"mp4a.40.2"}"#;
        assert_eq!(
            parse_resolved(&format!("\n{json}\n")),
            Ok(ResolvedStream {
                audio_url: "https://a/140".into(),
                video_url: None,
                height: None,
            })
        );
    }

    #[test]
    fn a_stream_with_picture_and_sound_counts_as_audio() {
        // e.g. format 18; the audio element plays it, no separate video
        let json =
            r#"{"url":"https://av/18","vcodec":"avc1.42001E","acodec":"mp4a.40.2","height":360}"#;
        let resolved = parse_resolved(json).unwrap();
        assert_eq!(resolved.audio_url, "https://av/18");
        assert_eq!(resolved.video_url, None);
    }

    #[test]
    fn missing_audio_url_is_an_error() {
        let video_only =
            r#"{"requested_formats":[{"url":"https://v/137","vcodec":"avc1","acodec":"none"}]}"#;
        assert!(parse_resolved(video_only).is_err());
        assert!(parse_resolved(r#"{"vcodec":"none","acodec":"opus"}"#).is_err());
        assert!(parse_resolved("").is_err());
        assert!(parse_resolved("ERROR: not json").is_err());
    }

    #[test]
    fn video_format_selector_is_one_line() {
        assert!(
            !VIDEO_FORMAT.contains(char::is_whitespace),
            "{VIDEO_FORMAT}"
        );
    }
}
