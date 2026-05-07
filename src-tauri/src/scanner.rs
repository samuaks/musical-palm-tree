use rayon::prelude::*;
use std::collections::HashMap;
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use tauri::Emitter;
use tauri::Manager;
use walkdir::WalkDir;
use lofty::file::TaggedFileExt;

#[derive(serde::Serialize, Clone)]
pub struct MediaFile {
    path: String,
    name: String,
    ext: String,
    duration_secs: f64,
    size_bytes: u64,
    art_path: Option<String>,
    created_at: u64
}

#[derive(serde::Serialize)]
pub struct Album {
    name: String,
    files: Vec<MediaFile>,
}

#[derive(serde::Serialize)]
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
    path: String,
    name: String,
    ext: String,
    top: String,
    album: Option<String>,
}

fn partial_hash(path: &str) -> Option<String> {
    let mut file = std::fs::File::open(path).ok()?;
    let mut buf = vec![0u8; 4096];

    file.read(&mut buf).ok()?;

    if file.seek(SeekFrom::End(-4096)).is_ok() {
        file.read(&mut buf).ok()?;
    }

    Some(format!("{:x}", md5::compute(&buf)))
}

/*fn read_duration(path: &str) -> f64 {
    // purkka ratkaisu isoihin tiedostoihin: jos yli 500mb, ei laske kestoa
    let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    if size > 500 * 1024 * 1024 {
        return 0.0;
    }

    Probe::open(path)
        .ok()
        .and_then(|p| p.guess_file_type().ok())
        .and_then(|f| f.read().ok())
        .map(|t| t.properties().duration().as_secs_f64())
        .unwrap_or(0.0)
}*/

fn read_size(path: &str) -> u64 {
    std::fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

fn extract_and_cache_art(path: &str, cache_dir: &PathBuf, hash: &str) -> Option<String> {
    let cache_file = cache_dir.join(format!("art_{}.jpg", hash));

    // cache hit — return immediately
    if cache_file.exists() {
        return Some(cache_file.to_string_lossy().to_string());
    }

    // cache miss — try to extract
    let tagged_file = lofty::read_from_path(path).ok()?;
    let tag = tagged_file.primary_tag()?;
    let picture = tag.pictures().first()?;

    std::fs::create_dir_all(cache_dir).ok()?;
    std::fs::write(&cache_file, picture.data()).ok()?;

    Some(cache_file.to_string_lossy().to_string())
}

fn read_created_at(path: &str) -> u64 {
    std::fs::metadata(path)
        .ok()
        .and_then(|m| m.created().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[tauri::command]
pub async fn scan_media(app: tauri::AppHandle) -> ScanResult {
    let start = std::time::Instant::now();
    let audio_ext = ["mp3", "flac", "wav", "aac", "ogg"];
    let video_ext = ["mp4", "mkv", "webm", "avi", "mov"];
    let allowed_dirs = ["Downloads", "Music", "Videos", "Desktop", "Documents"];
    let home = dirs::home_dir().unwrap_or(PathBuf::from("/"));
    let cache_dir = app.path().app_cache_dir().unwrap_or(PathBuf::from("./cache"));


    // phase 1 — single-threaded walk to collect entries
    let entries: Vec<Entry> = WalkDir::new(&home)
        .min_depth(1)
        .max_depth(4)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| {
            let ext = e
                .path()
                .extension()
                .and_then(|x| x.to_str())
                .map(|x| x.to_lowercase())?;

            if !audio_ext.contains(&ext.as_str()) && !video_ext.contains(&ext.as_str()) {
                return None;
            }

            let rel = e.path().strip_prefix(&home).ok()?;
            let parts: Vec<_> = rel.components().collect();
            if parts.len() < 2 {
                return None;
            }

            let top = parts[0].as_os_str().to_string_lossy().to_string();
            if !allowed_dirs.contains(&top.as_str()) {
                return None;
            }

            let album = if parts.len() >= 3 {
                Some(parts[1].as_os_str().to_string_lossy().to_string())
            } else {
                None
            };

            Some(Entry {
                path: e.path().to_string_lossy().to_string(),
                name: e.file_name().to_string_lossy().to_string(),
                ext,
                top,
                album,
            })
        })
        .collect();

    // phase 2 — process in parallel chunks, emit progress between chunks
    let chunk_size = 50;
    let mut groups: HashMap<String, Directory> = HashMap::new();
    let mut seen: HashMap<String, Vec<String>> = HashMap::new();

    println!("total entries collected: {}", entries.len());
    for chunk in entries.chunks(chunk_size) {
        let processed_chunk: Vec<(Entry, MediaFile, Option<String>)> = chunk
            .par_iter()
            .map(|entry| {
                let duration_secs = 0.0;
                let size_bytes = read_size(&entry.path);
                let hash = partial_hash(&entry.path);
                let art_path = hash.as_ref()
                .and_then(|h| extract_and_cache_art(&entry.path, &cache_dir, h));

                let file = MediaFile {
                    path: entry.path.clone(),
                    name: entry.name.clone(),
                    ext: entry.ext.clone(),
                    duration_secs,
                    size_bytes,
                    art_path,
                    created_at: read_created_at(&entry.path)
                };

                // clone entry since we only have a borrowed reference
                let entry_clone = Entry {
                    path: entry.path.clone(),
                    name: entry.name.clone(),
                    ext: entry.ext.clone(),
                    top: entry.top.clone(),
                    album: entry.album.clone(),
                };

                (entry_clone, file, hash)
            })
            .collect();

        // single-threaded merge into groups + dedup tracking
        for (entry, file, hash) in processed_chunk {
            if let Some(hash) = hash {
                let paths = seen.entry(hash).or_insert_with(Vec::new);
                if !paths.is_empty() {
                    paths.push(file.path.clone());
                    continue;
                }
                paths.push(file.path.clone());
            }

            let group = groups.entry(entry.top.clone()).or_insert(Directory {
                name: entry.top.clone(),
                path: home.join(&entry.top).to_string_lossy().to_string(),
                albums: Vec::new(),
                files: Vec::new(),
            });

            if let Some(album_name) = entry.album {
                if let Some(alb) = group.albums.iter_mut().find(|a| a.name == album_name) {
                    alb.files.push(file);
                } else {
                    group.albums.push(Album {
                        name: album_name,
                        files: vec![file],
                    });
                }
            } else {
                group.files.push(file);
            }
        }

        // emit after each chunk
        let mut current: Vec<&Directory> = groups.values().collect();
        current.sort_by(|a, b| a.name.cmp(&b.name));
        app.emit("scan_progress", &current).ok();

        let count: usize = groups
            .values()
            .map(|d| d.files.len() + d.albums.iter().map(|a| a.files.len()).sum::<usize>())
            .sum();
        println!("after chunk: count = {}", count);
        app.emit("scan_count", count).ok();
    }

    let final_count: usize = groups
        .values()
        .map(|d| d.files.len() + d.albums.iter().map(|a| a.files.len()).sum::<usize>())
        .sum();
    println!("after all chunks, before retain: {}", final_count);

    // post-processing — sort, dedup retain, build metadata
    let mut directories: Vec<Directory> = groups.into_values().collect();
    directories.sort_by(|a, b| a.name.cmp(&b.name));

    let mut paths_to_remove: std::collections::HashSet<String> = std::collections::HashSet::new();
    let duplicates: Vec<Vec<String>> = seen
        .into_values()
        .filter(|paths| paths.len() > 1)
        .map(|paths| {
            for path in paths.iter().skip(1) {
                paths_to_remove.insert(path.clone());
            }
            paths
        })
        .collect();

    for dir in directories.iter_mut() {
        dir.files.retain(|f| !paths_to_remove.contains(&f.path));
        for album in dir.albums.iter_mut() {
            album.files.retain(|f| !paths_to_remove.contains(&f.path));
        }
    }

    let total_files = directories
        .iter()
        .map(|d| d.files.len() + d.albums.iter().map(|a| a.files.len()).sum::<usize>())
        .sum();
    let total_albums = directories.iter().map(|d| d.albums.len()).sum();
    let total_directories = directories.len();

    ScanResult {
        metadata: ScanMetaData {
            duration_ms: start.elapsed().as_millis(),
            total_files,
            total_albums,
            total_directories,
            total_duplicates: duplicates.len(),
        },
        directories,
        duplicates,
    }
}
