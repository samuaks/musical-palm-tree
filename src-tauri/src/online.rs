use serde::{Deserialize, Serialize};
use tauri_plugin_shell::ShellExt;

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

    let output = app
        .shell()
        .sidecar("yt-dlp")
        .map_err(|e| format!("failed to create sidecar: {e}"))?
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
pub async fn resolve_stream(
    app: tauri::AppHandle,
    video_id: String,
) -> Result<String, String> {
    let url = format!("https://www.youtube.com/watch?v={video_id}");

    let output = app
        .shell()
        .sidecar("yt-dlp")
        .map_err(|e| format!("failed to create sidecar: {e}"))?
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