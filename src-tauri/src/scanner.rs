use lofty::config::ParseOptions;
use lofty::file::TaggedFileExt;
use lofty::probe::Probe;
use rayon::prelude::*;
use std::collections::{BTreeMap, HashMap};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, UNIX_EPOCH};
use tauri::{Emitter, Manager};
use walkdir::WalkDir;

const AUDIO_EXT: &[&str] = &["mp3", "flac", "wav", "aac", "ogg"];
const VIDEO_EXT: &[&str] = &["mp4", "mkv", "webm", "avi", "mov"];
/// Formats lofty can read embedded cover art from. Others skip art extraction entirely.
const ART_EXT: &[&str] = &["mp3", "flac", "wav", "aac", "ogg", "mp4"];
const ALLOWED_DIRS: &[&str] = &["Downloads", "Music", "Videos", "Desktop", "Documents"];
/// Depth below each allowed dir (same reach as the old max_depth(4) from home).
const MAX_DEPTH: usize = 3;
/// Files processed in parallel between merges into the tree.
const CHUNK: usize = 256;
/// Minimum gap between `scan_progress` tree snapshots; each one re-serializes the whole tree.
const PROGRESS_INTERVAL: Duration = Duration::from_millis(250);

#[derive(serde::Serialize, Clone)]
pub struct MediaFile {
    path: String,
    name: String,
    ext: String,
    duration_secs: f64,
    size_bytes: u64,
    art_path: Option<String>,
    created_at: u64,
}

#[derive(serde::Serialize, Clone)]
pub struct Album {
    name: String,
    files: Vec<MediaFile>,
}

#[derive(serde::Serialize, Clone)]
pub struct Directory {
    name: String,
    path: String,
    albums: Vec<Album>,
    files: Vec<MediaFile>,
}

#[derive(serde::Serialize)]
pub struct ScanMetaData {
    duration_ms: u128,
    total_files: usize,
    total_albums: usize,
    total_directories: usize,
    total_duplicates: usize,
}

#[derive(serde::Serialize)]
pub struct ScanResult {
    metadata: ScanMetaData,
    directories: Vec<Directory>,
    duplicates: Vec<Vec<String>>,
}

struct Entry {
    path: PathBuf,
    name: String,
    ext: &'static str,
    top: &'static str,
    album: Option<String>,
}

struct Processed {
    top: &'static str,
    album: Option<String>,
    hash: Option<String>,
    file: MediaFile,
}

#[derive(Default)]
struct Group {
    albums: BTreeMap<String, Vec<MediaFile>>,
    files: Vec<MediaFile>,
}

fn to_directories(groups: &BTreeMap<&'static str, Group>, home: &Path) -> Vec<Directory> {
    groups
        .iter()
        .map(|(top, g)| Directory {
            name: top.to_string(),
            path: home.join(top).to_string_lossy().into_owned(),
            albums: g
                .albums
                .iter()
                .map(|(name, files)| Album {
                    name: name.clone(),
                    files: files.clone(),
                })
                .collect(),
            files: g.files.clone(),
        })
        .collect()
}

#[tauri::command]
pub async fn scan_media(app: tauri::AppHandle) -> Result<ScanResult, String> {
    // The scan is blocking disk I/O; keep it off the async runtime's worker threads.
    tauri::async_runtime::spawn_blocking(move || scan(&app))
        .await
        .map_err(|e| e.to_string())
}

fn scan(app: &tauri::AppHandle) -> ScanResult {
    let start = Instant::now();
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"));
    let cache_dir = app
        .path()
        .app_cache_dir()
        .unwrap_or_else(|_| PathBuf::from("./cache"));
    let _ = std::fs::create_dir_all(&cache_dir);

    // Phase 1: walk only the allowed dirs (in parallel) and collect media paths.
    let entries = collect_entries(&home);

    // Phase 2: metadata, hash and cover art in parallel, one chunk at a time.
    // Phase 3: merge each chunk sequentially in walk order, so "first seen" is deterministic.
    let mut groups: BTreeMap<&'static str, Group> = BTreeMap::new();
    let mut seen: HashMap<String, Vec<String>> = HashMap::new();
    let mut total_files = 0;
    let mut last_progress = Instant::now();
    let mut entries = entries.into_iter();

    loop {
        let chunk: Vec<Entry> = entries.by_ref().take(CHUNK).collect();
        if chunk.is_empty() {
            break;
        }
        let processed: Vec<Processed> = chunk
            .into_par_iter()
            .map(|entry| process(entry, &cache_dir))
            .collect();

        for p in processed {
            if let Some(hash) = p.hash {
                let paths = seen.entry(hash).or_default();
                paths.push(p.file.path.clone());
                if paths.len() > 1 {
                    continue; // duplicate: recorded in `duplicates`, kept out of the tree
                }
            }
            total_files += 1;
            let group = groups.entry(p.top).or_default();
            match p.album {
                Some(album) => group.albums.entry(album).or_default().push(p.file),
                None => group.files.push(p.file),
            }
        }

        app.emit("scan_count", total_files).ok();
        if last_progress.elapsed() >= PROGRESS_INTERVAL {
            app.emit("scan_progress", to_directories(&groups, &home))
                .ok();
            last_progress = Instant::now();
        }
    }

    let directories = to_directories(&groups, &home);
    let duplicates: Vec<Vec<String>> = seen.into_values().filter(|p| p.len() > 1).collect();

    ScanResult {
        metadata: ScanMetaData {
            duration_ms: start.elapsed().as_millis(),
            total_files,
            total_albums: directories.iter().map(|d| d.albums.len()).sum(),
            total_directories: directories.len(),
            total_duplicates: duplicates.len(),
        },
        directories,
        duplicates,
    }
}

fn collect_entries(home: &Path) -> Vec<Entry> {
    ALLOWED_DIRS
        .par_iter()
        .flat_map_iter(|&top| {
            let root = home.join(top);
            WalkDir::new(&root)
                .min_depth(1)
                .max_depth(MAX_DEPTH)
                .into_iter()
                .filter_map(Result::ok)
                .filter(|e| e.file_type().is_file())
                .filter_map(move |e| {
                    let ext = e.path().extension()?.to_str()?;
                    let ext = *AUDIO_EXT
                        .iter()
                        .chain(VIDEO_EXT)
                        .find(|x| x.eq_ignore_ascii_case(ext))?;

                    // depth 1 = file directly in the top dir, deeper = first subfolder is the album
                    let album = (e.depth() > 1)
                        .then(|| e.path().strip_prefix(&root).ok()?.iter().next())
                        .flatten()
                        .map(|a| a.to_string_lossy().into_owned());

                    Some(Entry {
                        name: e.file_name().to_string_lossy().into_owned(),
                        path: e.into_path(),
                        ext,
                        top,
                        album,
                    })
                })
        })
        .collect()
}

fn process(entry: Entry, cache_dir: &Path) -> Processed {
    // One metadata call instead of two.
    let meta = std::fs::metadata(&entry.path).ok();
    let size_bytes = meta.as_ref().map_or(0, |m| m.len());
    let created_at = meta
        .as_ref()
        .and_then(|m| m.created().ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_millis() as u64);

    let hash = meta
        .as_ref()
        .and_then(|m| partial_hash(&entry.path, m.len()));

    let art_path = match &hash {
        Some(h) if ART_EXT.contains(&entry.ext) => cached_art(&entry.path, cache_dir, h),
        _ => None,
    };

    Processed {
        top: entry.top,
        album: entry.album,
        hash,
        file: MediaFile {
            path: entry.path.to_string_lossy().into_owned(),
            name: entry.name,
            ext: entry.ext.to_string(),
            duration_secs: 0.0,
            size_bytes,
            art_path,
            created_at,
        },
    }
}

/// Hash of file size + first 4 KiB + last 4 KiB. Fast, but a match is a strong hint,
/// not proof: confirm with a full hash if you ever delete files based on it.
fn partial_hash(path: &Path, size: u64) -> Option<String> {
    const SAMPLE: u64 = 4096;
    let mut file = File::open(path).ok()?;
    let mut buf = [0u8; SAMPLE as usize];
    let mut ctx = md5::Context::new();
    ctx.consume(size.to_le_bytes());

    let head = size.min(SAMPLE) as usize;
    file.read_exact(&mut buf[..head]).ok()?;
    ctx.consume(&buf[..head]);

    if size > SAMPLE {
        // never overlaps the head, so small files aren't hashed twice
        let tail = (size - SAMPLE).min(SAMPLE);
        file.seek(SeekFrom::End(-(tail as i64))).ok()?;
        file.read_exact(&mut buf[..tail as usize]).ok()?;
        ctx.consume(&buf[..tail as usize]);
    }

    Some(format!("{:x}", ctx.compute()))
}

fn cached_art(path: &Path, cache_dir: &Path, hash: &str) -> Option<String> {
    let art = cache_dir.join(format!("art_{hash}.jpg"));
    if art.exists() {
        return Some(art.to_string_lossy().into_owned());
    }

    // Marker so files without art aren't re-parsed on every scan.
    let no_art = cache_dir.join(format!("art_{hash}.none"));
    if no_art.exists() {
        return None;
    }

    let tagged = Probe::open(path)
        .ok()? // I/O error: bail without writing a marker, retry next scan
        .options(ParseOptions::new().read_properties(false)) // skip duration/bitrate parsing
        .guess_file_type()
        .ok()
        .and_then(|p| p.read().ok());

    let picture = tagged
        .as_ref()
        .and_then(|f| f.primary_tag().or_else(|| f.first_tag()))
        .and_then(|t| t.pictures().first());

    match picture {
        Some(pic) => {
            std::fs::write(&art, pic.data()).ok()?;
            Some(art.to_string_lossy().into_owned())
        }
        None => {
            let _ = std::fs::write(&no_art, b"");
            None
        }
    }
}
