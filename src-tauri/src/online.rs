use crate::ytdlp;
use serde::{Deserialize, Serialize};

/// Where online results come from. YouTube can be searched; Twitch can't (yt-dlp has no Twitch
/// search), so a Twitch query is a channel name whose recent VODs are listed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Platform {
    Youtube,
    Twitch,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct OnlineSearchResult {
    pub platform: Platform,
    pub video_id: String,
    pub title: String,
    pub duration_secs: f64,
    pub thumbnail: Option<String>,
    pub uploader: Option<String>,
    pub view_count: Option<u64>,
    /// When it was published or broadcast (Unix seconds), if known.
    pub timestamp: Option<i64>,
}

// What yt-dlp emits per line with --dump-json (--flat-playlist for searches and channel lists)
#[derive(Debug, Deserialize)]
struct YtDlpFlatEntry {
    id: String,
    title: String,
    duration: Option<f64>,
    thumbnails: Option<Vec<YtDlpThumbnail>>,
    thumbnail: Option<String>,
    uploader: Option<String>,
    channel: Option<String>,
    view_count: Option<f64>,
    timestamp: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct YtDlpThumbnail {
    url: String,
    width: Option<u32>,
}

/// Results per search or channel list. YouTube returns about 20 per request, so 20 costs the same
/// as 10 (~1.7 s, most of it yt-dlp starting up); each further batch adds ~0.5 s.
const SEARCH_RESULTS: usize = 20;

/// What a query in the search box asks for.
#[derive(Debug, PartialEq)]
enum Target {
    /// Free text, searched on YouTube.
    YouTubeSearch(String),
    /// A Twitch channel: its most recent VODs.
    TwitchChannel(String),
    /// A pasted link to one video, on either platform.
    Video(Platform, String),
}

/// Sorts a query into a [`Target`]. Pasted links win over the selected platform: a YouTube link
/// opens on the Twitch tab too.
fn classify(query: &str, platform: Platform) -> Result<Target, String> {
    let query = query.trim();
    if let Some(target) = classify_url(query) {
        return Ok(target);
    }
    match platform {
        Platform::Youtube => Ok(Target::YouTubeSearch(query.to_string())),
        Platform::Twitch if is_channel_name(query) => {
            Ok(Target::TwitchChannel(query.to_ascii_lowercase()))
        }
        Platform::Twitch => {
            Err("Twitch can't be searched: enter a channel name or paste a VOD link".to_string())
        }
    }
}

/// YouTube watch/shorts/youtu.be links, Twitch VOD links and Twitch channel links.
fn classify_url(query: &str) -> Option<Target> {
    let rest = query
        .strip_prefix("https://")
        .or_else(|| query.strip_prefix("http://"))
        .unwrap_or(query);
    let (host, path) = rest.split_once('/').unwrap_or((rest, ""));
    let host = host.to_ascii_lowercase();
    let host = ["www.", "m.", "music."]
        .iter()
        .find_map(|p| host.strip_prefix(p))
        .unwrap_or(&host)
        .to_string();
    let (path, params) = path.split_once('?').unwrap_or((path, ""));
    let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    let video = |platform, id: &str| {
        media_url(platform, id).map(|_| Target::Video(platform, id.to_string()))
    };

    match (host.as_str(), segments.as_slice()) {
        ("youtube.com", ["watch"]) => params
            .split('&')
            .find_map(|p| p.strip_prefix("v="))
            .and_then(|id| video(Platform::Youtube, id)),
        ("youtube.com", ["shorts" | "live", id, ..]) => video(Platform::Youtube, id),
        ("youtu.be", [id, ..]) => video(Platform::Youtube, id),
        ("twitch.tv", ["videos", id, ..]) => video(Platform::Twitch, id),
        ("twitch.tv", [name] | [name, "videos"]) if is_channel_name(name) => {
            Some(Target::TwitchChannel(name.to_ascii_lowercase()))
        }
        _ => None,
    }
}

/// Twitch login names: 3–25 letters, digits or underscores.
fn is_channel_name(name: &str) -> bool {
    (3..=25).contains(&name.len()) && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}

/// The page URL for a video id, or `None` if the id isn't valid for that platform. Ids end up in
/// URLs and file names, so they're checked here once.
pub fn media_url(platform: Platform, id: &str) -> Option<String> {
    match platform {
        Platform::Youtube => {
            let valid = id.len() == 11
                && id
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
            valid.then(|| format!("https://www.youtube.com/watch?v={id}"))
        }
        Platform::Twitch => {
            let digits = id.strip_prefix('v').unwrap_or(id);
            let valid =
                (1..=20).contains(&digits.len()) && digits.chars().all(|c| c.is_ascii_digit());
            valid.then(|| format!("https://www.twitch.tv/videos/{digits}"))
        }
    }
}

#[tauri::command]
pub async fn search_online(
    app: tauri::AppHandle,
    query: String,
    platform: Platform,
) -> Result<Vec<OnlineSearchResult>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let limit = SEARCH_RESULTS.to_string();
    let (args, platform, channel): (Vec<String>, Platform, Option<String>) =
        match classify(&query, platform)? {
            Target::YouTubeSearch(text) => (
                vec![
                    "--flat-playlist".into(),
                    format!("ytsearch{SEARCH_RESULTS}:{text}"),
                ],
                Platform::Youtube,
                None,
            ),
            Target::TwitchChannel(name) => (
                vec![
                    "--flat-playlist".into(),
                    "--playlist-end".into(),
                    limit,
                    format!("https://www.twitch.tv/{name}/videos?filter=archives&sort=time"),
                ],
                Platform::Twitch,
                Some(name),
            ),
            Target::Video(platform, id) => {
                let url = media_url(platform, &id).ok_or("invalid video link")?;
                (vec!["--no-playlist".into(), url], platform, None)
            }
        };

    let mut all = vec!["--dump-json", "--no-warnings"];
    all.extend(args.iter().map(String::as_str));
    let stdout = ytdlp::run(&app, &all).await?;
    Ok(parse_entries(&stdout, platform, channel.as_deref()))
}

/// One result per JSON line. Twitch channel lists don't name the channel in each entry, so
/// `channel` fills in the uploader.
fn parse_entries(
    stdout: &str,
    platform: Platform,
    channel: Option<&str>,
) -> Vec<OnlineSearchResult> {
    let mut results: Vec<OnlineSearchResult> = stdout
        .lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| serde_json::from_str::<YtDlpFlatEntry>(line).ok())
        .map(|entry| {
            let thumbnail = pick_thumbnail(entry.thumbnails).or(entry.thumbnail);
            // A Twitch channel list has no dates, but its thumbnails carry the broadcast start.
            let timestamp = entry
                .timestamp
                .map(|t| t as i64)
                .or_else(|| thumbnail.as_deref().and_then(twitch_thumbnail_time));
            OnlineSearchResult {
                platform,
                video_id: entry.id,
                title: entry.title,
                duration_secs: entry.duration.unwrap_or(0.0),
                // Twitch's placeholder for VODs it's still processing
                thumbnail: thumbnail.filter(|url| !url.contains("/_404/")),
                uploader: entry
                    .uploader
                    .or(entry.channel)
                    .or_else(|| channel.map(str::to_string)),
                view_count: entry.view_count.map(|n| n as u64),
                timestamp,
            }
        })
        .collect();

    // Twitch VOD ids only go up, so newest first even for VODs still processing (no thumbnail,
    // so no date). The channel list is requested sorted by time already; this keeps it so.
    if platform == Platform::Twitch {
        results.sort_by_key(|r| std::cmp::Reverse(twitch_vod_number(&r.video_id)));
    }
    results
}

fn twitch_vod_number(id: &str) -> u64 {
    id.trim_start_matches('v').parse().unwrap_or(0)
}

/// Twitch VOD thumbnails look like `.../<hash>_<channel>_<stream id>_<start time>//thumb/...`;
/// the last part before `//thumb/` is when the broadcast started (Unix seconds).
fn twitch_thumbnail_time(url: &str) -> Option<i64> {
    let before = &url[..url.find("//thumb/")?];
    let time = before.rsplit('_').next()?;
    let time: i64 = time.parse().ok()?;
    // 2010..2100: anything else isn't a timestamp
    (1_262_304_000..4_102_444_800)
        .contains(&time)
        .then_some(time)
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
    height: Option<u32>,
}

impl YtDlpFormat {
    fn has_picture(&self) -> bool {
        self.vcodec.as_deref().is_some_and(|c| c != "none")
    }
}

/// Only YouTube's 360p format has picture and sound in one stream, so better video is a
/// video-only stream plus an audio stream. avc1 first because every WebView decodes it, the
/// direct https files rather than YouTube's HLS variants, and audio only if there's no usable
/// video.
const YOUTUBE_VIDEO_FORMAT: &str =
    "bv[height<=1080][vcodec^=avc1][protocol=https]+ba[ext=m4a][protocol=https]\
     /bv[height<=1080][protocol=https]+ba[protocol=https]/ba";
/// m4a (AAC) plays in WebKit too, unlike some opus/webm streams.
const YOUTUBE_AUDIO_FORMAT: &str = "ba[ext=m4a]/ba";
/// Twitch only serves HLS, which the WebViews play natively. Every quality has sound too, so
/// `--audio-multistreams` is needed to pair one with the Audio_Only rendition; the picture then
/// plays muted, the same way as YouTube's.
const TWITCH_VIDEO_FORMAT: &str =
    "bv*[height<=720][protocol^=m3u8]+ba[protocol^=m3u8]/b[height<=720]";
const TWITCH_AUDIO_FORMAT: &str = "ba/b";

#[tauri::command]
pub async fn resolve_stream(
    app: tauri::AppHandle,
    platform: Platform,
    video_id: String,
    video: bool,
) -> Result<ResolvedStream, String> {
    let url = media_url(platform, &video_id).ok_or("invalid video id")?;
    let format = match (platform, video) {
        (Platform::Youtube, true) => YOUTUBE_VIDEO_FORMAT,
        (Platform::Youtube, false) => YOUTUBE_AUDIO_FORMAT,
        (Platform::Twitch, true) => TWITCH_VIDEO_FORMAT,
        (Platform::Twitch, false) => TWITCH_AUDIO_FORMAT,
    };

    let mut args = vec![
        "-f",
        format,
        "--dump-json",
        "--no-warnings",
        "--no-playlist",
    ];
    if platform == Platform::Twitch && video {
        args.push("--audio-multistreams");
    }
    args.push(&url);
    let stdout = ytdlp::run(&app, &args).await?;

    parse_resolved(&stdout)
}

fn parse_resolved(stdout: &str) -> Result<ResolvedStream, String> {
    let line = stdout
        .lines()
        .find(|line| !line.trim().is_empty())
        .ok_or("yt-dlp returned nothing")?;
    let resolved: YtDlpResolved =
        serde_json::from_str(line).map_err(|e| format!("couldn't read yt-dlp output: {e}"))?;

    let (video, audio) = match resolved.requested_formats {
        // A pair: the picture is whichever has one (a Twitch picture stream has sound too, but
        // it plays muted); the sound is the other.
        Some(formats) => {
            let video = formats.iter().position(YtDlpFormat::has_picture);
            let audio = formats
                .iter()
                .enumerate()
                .find(|(i, _)| Some(*i) != video)
                .map(|(_, f)| f);
            let video = video.map(|i| &formats[i]);
            (
                video.map(|f| (f.url.clone(), f.height)),
                audio.and_then(|f| f.url.clone()),
            )
        }
        // One format plays as sound, even one with a picture (YouTube's 360p, or a Twitch
        // stream with no audio-only rendition).
        None => (None, resolved.format.url.clone()),
    };

    let (video_url, height) = video.unwrap_or((None, None));
    Ok(ResolvedStream {
        audio_url: audio.ok_or("yt-dlp returned no audio stream URL")?,
        video_url,
        height,
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
    fn format_selectors_are_one_line() {
        for format in [YOUTUBE_VIDEO_FORMAT, TWITCH_VIDEO_FORMAT] {
            assert!(!format.contains(char::is_whitespace), "{format}");
        }
    }

    #[test]
    fn twitch_pair_plays_the_picture_muted_and_audio_only_as_sound() {
        // From a real resolve: the 720p60 stream has sound too
        let json = r#"{"id":"v1","requested_formats":[
            {"format_id":"720p60","url":"https://t/720p60/index-dvr.m3u8","vcodec":"avc1.4D4020","acodec":"mp4a.40.2","height":720},
            {"format_id":"Audio_Only","url":"https://t/audio_only/index-dvr.m3u8","vcodec":"none","acodec":"mp4a.40.2"}
        ]}"#
        .replace('\n', "");
        assert_eq!(
            parse_resolved(&json),
            Ok(ResolvedStream {
                audio_url: "https://t/audio_only/index-dvr.m3u8".into(),
                video_url: Some("https://t/720p60/index-dvr.m3u8".into()),
                height: Some(720),
            })
        );
    }

    #[test]
    fn ids_are_validated_per_platform() {
        assert_eq!(
            media_url(Platform::Youtube, "dQw4w9WgXcQ").as_deref(),
            Some("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
        );
        assert_eq!(
            media_url(Platform::Twitch, "v2905135575").as_deref(),
            Some("https://www.twitch.tv/videos/2905135575")
        );
        assert_eq!(
            media_url(Platform::Twitch, "2905135575").as_deref(),
            Some("https://www.twitch.tv/videos/2905135575")
        );
        for (platform, bad) in [
            (Platform::Youtube, "short"),
            (Platform::Youtube, "--exec rm -r"),
            (Platform::Twitch, "v12a"),
            (Platform::Twitch, "v"),
            (Platform::Twitch, "dQw4w9WgXcQ"),
        ] {
            assert_eq!(media_url(platform, bad), None, "{bad}");
        }
    }

    #[test]
    fn queries_are_classified() {
        use Platform::*;
        let yt = |id: &str| Ok(Target::Video(Youtube, id.into()));
        assert_eq!(
            classify("  lofi beats ", Youtube),
            Ok(Target::YouTubeSearch("lofi beats".into()))
        );
        assert_eq!(
            classify("LIRIK", Twitch),
            Ok(Target::TwitchChannel("lirik".into()))
        );
        assert!(
            classify("lofi beats", Twitch).is_err(),
            "not a channel name"
        );
        assert!(classify("ab", Twitch).is_err(), "too short");

        // Links win over the selected tab
        assert_eq!(
            classify("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42", Twitch),
            yt("dQw4w9WgXcQ")
        );
        assert_eq!(
            classify("https://youtu.be/dQw4w9WgXcQ?si=x", Twitch),
            yt("dQw4w9WgXcQ")
        );
        assert_eq!(
            classify("youtube.com/shorts/dQw4w9WgXcQ", Youtube),
            yt("dQw4w9WgXcQ")
        );
        assert_eq!(
            classify("https://music.youtube.com/watch?v=dQw4w9WgXcQ", Youtube),
            yt("dQw4w9WgXcQ")
        );
        assert_eq!(
            classify("https://www.twitch.tv/videos/2905135575", Youtube),
            Ok(Target::Video(Twitch, "2905135575".into()))
        );
        assert_eq!(
            classify("https://www.twitch.tv/Lirik/videos", Youtube),
            Ok(Target::TwitchChannel("lirik".into()))
        );
        assert_eq!(
            classify("twitch.tv/lirik", Youtube),
            Ok(Target::TwitchChannel("lirik".into()))
        );
        // Not a link we know: searched as text on YouTube
        assert_eq!(
            classify("https://example.com/watch?v=dQw4w9WgXcQ", Youtube),
            Ok(Target::YouTubeSearch(
                "https://example.com/watch?v=dQw4w9WgXcQ".into()
            ))
        );
    }

    #[test]
    fn twitch_channel_entries_get_the_channel_as_uploader() {
        // Trimmed from a real `twitch.tv/lirik/videos` flat listing
        // (given oldest first, to check the sort)
        let gaming = "https://static-cdn.jtvnw.net/cf_vods/d2vi6trrdongqn/e777ba17c25f0a2ef341_lirik_320824419292_1792425994//thumb/thumb0-320x180.jpg";
        let older = format!(
            r#"{{"_type": "url_transparent", "ie_key": "TwitchVod", "id": "v2905135575", "title": "Gaming", "thumbnail": "{gaming}", "duration": 23360.0, "view_count": 248515}}"#
        );
        let newer = r#"{"_type": "url_transparent", "ie_key": "TwitchVod", "id": "v2905988766", "title": "Pogging", "thumbnail": "https://vod-secure.twitch.tv/_404/404_processing_320x180.png", "duration": 10727.0, "view_count": 630}"#;
        let stdout = format!("{older}\n{newer}\n");
        let results = parse_entries(&stdout, Platform::Twitch, Some("lirik"));
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].video_id, "v2905988766", "newest first");
        assert_eq!(results[0].thumbnail, None, "processing placeholder dropped");
        assert_eq!(results[0].timestamp, None);
        assert_eq!(results[0].uploader.as_deref(), Some("lirik"));
        assert_eq!(results[1].thumbnail.as_deref(), Some(gaming));
        assert_eq!(results[1].timestamp, Some(1792425994));
        assert_eq!(results[1].view_count, Some(248515));
        assert_eq!(results[1].duration_secs, 23360.0);
        assert!(results.iter().all(|r| r.platform == Platform::Twitch));
    }

    #[test]
    fn twitch_thumbnails_give_the_broadcast_time() {
        assert_eq!(
            twitch_thumbnail_time("https://static-cdn.jtvnw.net/cf_vods/d2/3b4d_youbr_320784228956_1792192557//thumb/thumb0-320x180.jpg"),
            Some(1792192557)
        );
        assert_eq!(
            twitch_thumbnail_time("https://vod-secure.twitch.tv/_404/404_processing_320x180.png"),
            None
        );
        assert_eq!(
            twitch_thumbnail_time("https://i.ytimg.com/vi/x/hqdefault.jpg"),
            None
        );
        assert_eq!(
            twitch_thumbnail_time("https://x/a_b_42//thumb/t.jpg"),
            None,
            "not a time"
        );
    }

    #[test]
    fn youtube_results_keep_their_order_and_dates() {
        let stdout = concat!(
            r#"{"id": "bbbbbbbbbbb", "title": "B", "timestamp": 1700000000}"#,
            "\n",
            r#"{"id": "aaaaaaaaaaa", "title": "A"}"#,
            "\n"
        );
        let results = parse_entries(stdout, Platform::Youtube, None);
        let ids: Vec<_> = results.iter().map(|r| r.video_id.as_str()).collect();
        assert_eq!(
            ids,
            ["bbbbbbbbbbb", "aaaaaaaaaaa"],
            "search relevance order"
        );
        assert_eq!(results[0].timestamp, Some(1700000000));
        assert_eq!(results[1].timestamp, None);
    }
}
