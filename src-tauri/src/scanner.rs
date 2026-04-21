use std::path::PathBuf;
use walkdir::WalkDir;
use std::io::{Read, Seek, SeekFrom};
use std::collections::HashMap;
use tauri::Emitter;
use lofty::probe::Probe;
use lofty::prelude::AudioFile;



#[derive(serde::Serialize)]
pub struct MediaFile {
    path: String,
    name: String,
    ext: String,
    duration_secs: f64,
    size_bytes: u64
}

#[derive(serde::Serialize)]
pub struct Album {
    name: String,
    files: Vec<MediaFile>
}

#[derive(serde::Serialize)]
pub struct Directory {
    name: String,
    path: String,
    albums: Vec<Album>,
    files: Vec<MediaFile>
}

#[derive(serde::Serialize)]
pub struct ScanMetaData {
    duration_ms: u128,
    total_files: usize,
    total_albums: usize,
    total_directories: usize,
    total_duplicates: usize
}

#[derive(serde::Serialize)]
pub struct ScanResult {
    metadata: ScanMetaData,
    directories: Vec<Directory>,
    duplicates: Vec<Vec<String>>
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

fn read_duration(path: &str) -> f64 {
    Probe::open(path)
        .ok()
        .and_then(|p| p.guess_file_type().ok())
        .and_then(|f| f.read().ok())
        .map(|t| t.properties().duration().as_secs_f64())
        .unwrap_or(0.0)
}

fn read_size(path: &str) -> u64 {
    std::fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

#[tauri::command]
pub async fn scan_media(app: tauri::AppHandle) -> ScanResult {
    let start = std::time::Instant::now();
    let audio_ext = ["mp3", "flac", "wav", "aac", "ogg"];
    let video_ext = ["mp4", "mkv", "webm", "avi", "mov"];

    let home = dirs::home_dir().unwrap_or(PathBuf::from("/"));

    let mut groups: HashMap<String, Directory> = HashMap::new();
    let mut seen: HashMap<String, Vec<String>> = HashMap::new();
    let mut file_count = 0;

    WalkDir::new(&home)
        .min_depth(1)
        .max_depth(4)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
       .for_each(|e| {
            let ext = match e.path()
                .extension()
                .and_then(|x| x.to_str())
                .map(|x| x.to_lowercase())
            {
                Some(x) if audio_ext.contains(&x.as_str()) || video_ext.contains(&x.as_str()) => x,
                _ => return,
            };

            let rel = e.path().strip_prefix(&home).unwrap();
            let parts: Vec<_> = rel.components().collect();
            if parts.len() < 2 { return; }

            let top = parts[0].as_os_str().to_string_lossy().to_string();

            // skip dirs not in whitelist
            let allowed_dirs = ["Downloads", "Music", "Videos", "Desktop", "Documents"];
            if !allowed_dirs.contains(&top.as_str()) { return; }

            let file = MediaFile {
                path: e.path().to_string_lossy().to_string(),
                name: e.file_name().to_string_lossy().to_string(),
                ext,
                duration_secs: read_duration(e.path().to_str().unwrap_or("")),
                size_bytes: read_size(e.path().to_str().unwrap_or(""))
            };

            if let Some(hash) = partial_hash(e.path().to_str().unwrap_or("")) {
                let paths = seen.entry(hash).or_insert_with(Vec::new);
                // if we've already seen this hash, skip adding to groups entirely
                if !paths.is_empty() {
                    paths.push(e.path().to_string_lossy().to_string());
                    return;
                }
                paths.push(e.path().to_string_lossy().to_string());
            }
            if parts.len() >= 3 {
                let album = parts[1].as_os_str().to_string_lossy().to_string();
                let group = groups.entry(top.clone()).or_insert(Directory {
                    name: top.clone(),
                    path: home.join(&top).to_string_lossy().to_string(),
                    albums: Vec::new(),
                    files: Vec::new(),
                });
                if let Some(alb) = group.albums.iter_mut().find(|a| a.name == album) {
                    alb.files.push(file);
                } else {
                    group.albums.push(Album { name: album, files: vec![file] });
                }
            } else {
                let group = groups.entry(top.clone()).or_insert(Directory {
                    name: top.clone(),
                    path: home.join(&top).to_string_lossy().to_string(),
                    albums: Vec::new(),
                    files: Vec::new(),
                });
                group.files.push(file);
            }
            file_count += 1;

            if file_count % 10 == 0 {
                let mut current: Vec<&Directory> = groups.values().collect();
                current.sort_by(|a, b| a.name.cmp(&b.name));
                app.emit("scan_progress", &current).ok();
            }
        });

        let mut directories: Vec<Directory> = groups.into_values().collect();
        directories.sort_by(|a, b| a.name.cmp(&b.name));

        let mut paths_to_remove: std::collections::HashSet<String> = std::collections::HashSet::new();
        let duplicates: Vec<Vec<String>> = seen.into_values()
            .filter(|paths| paths.len() > 1)
            .map(|paths| {
                for path in paths.iter().skip(1) {
                    paths_to_remove.insert(path.clone());
                }
                paths
            })
            .collect();

        println!("paths_to_remove: {:?}", paths_to_remove);
        println!("sample file path: {}", directories[0].files.first().map(|f| f.path.as_str()).unwrap_or("none"));

        // remove duplicates first
        for dir in directories.iter_mut() {
            dir.files.retain(|f| !paths_to_remove.contains(&f.path));
            for album in dir.albums.iter_mut() {
                album.files.retain(|f| !paths_to_remove.contains(&f.path));
            }
        }

        // then count after dedup
        let total_files = directories.iter()
            .map(|d| d.files.len() + d.albums.iter().map(|a| a.files.len()).sum::<usize>())
            .sum();
        let total_albums = directories.iter().map(|d| d.albums.len()).sum();
        let total_directories = directories.len();
        ScanResult {
            metadata: ScanMetaData { duration_ms: start.elapsed().as_millis(), total_files, total_albums, total_directories, total_duplicates: duplicates.len() },
            directories,
            duplicates
        }


}
