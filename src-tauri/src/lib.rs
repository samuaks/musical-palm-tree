use std::path::PathBuf;
use walkdir::WalkDir;
use std::collections::HashMap;



#[derive(serde::Serialize)]
pub struct MediaFile {
    path: String,
    name: String,
    ext: String
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
    total_directories: usize
}

#[derive(serde::Serialize)]
pub struct ScanResult {
    metadata: ScanMetaData,
    directories: Vec<Directory>
}

#[tauri::command]
fn scan_media() -> ScanResult {
    let start = std::time::Instant::now();
    let audio_ext = ["mp3", "flac", "wav", "aac", "ogg"];
    let video_ext = ["mp4", "mkv", "webm", "avi", "mov"];

    let home = dirs::home_dir().unwrap_or(PathBuf::from("/"));

    let mut groups: HashMap<String, Directory> = HashMap::new();

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
            };

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
        });

        let mut directories: Vec<Directory> = groups.into_values().collect();
        directories.sort_by(|a, b| a.name.cmp(&b.name));

        let total_files = directories.iter().map(|d| d.files.len() + d.albums.iter().map(|a| a.files.len()).sum::<usize>()).sum();
        let total_albums = directories.iter().map(|d| d.albums.len()).sum();
        let total_directories = directories.len();

        ScanResult {
            metadata: ScanMetaData { duration_ms: start.elapsed().as_millis(), total_files, total_albums, total_directories },
            directories
        }


}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![scan_media])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
