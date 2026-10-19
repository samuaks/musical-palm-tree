use rayon::prelude::*;
use std::cmp::Ordering;
use std::collections::{BTreeMap, HashMap};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, UNIX_EPOCH};
use tauri::Emitter;
use walkdir::WalkDir;

const AUDIO_EXT: &[&str] = &["mp3", "flac", "wav", "aac", "ogg", "m4a"];
const VIDEO_EXT: &[&str] = &["mp4", "mkv", "webm", "avi", "mov"];
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

/// The directory tree being built, plus the hashes seen so far for dedup.
#[derive(Default)]
struct Library {
    groups: BTreeMap<&'static str, Group>,
    seen: HashMap<String, Vec<String>>,
    total_files: usize,
}

impl Library {
    /// Adds a file to the tree, unless its hash was already seen; then it is only
    /// recorded as a duplicate. Call in walk order so "first seen" is deterministic.
    fn add(&mut self, p: Processed) {
        if let Some(hash) = p.hash {
            let paths = self.seen.entry(hash).or_default();
            paths.push(p.file.path.clone());
            if paths.len() > 1 {
                return;
            }
        }
        self.total_files += 1;
        let group = self.groups.entry(p.top).or_default();
        match p.album {
            Some(album) => group.albums.entry(album).or_default().push(p.file),
            None => group.files.push(p.file),
        }
    }

    fn directories(&self, home: &Path) -> Vec<Directory> {
        self.groups
            .iter()
            .map(|(top, g)| {
                let mut albums: Vec<Album> = g
                    .albums
                    .iter()
                    .map(|(name, files)| Album {
                        name: name.clone(),
                        files: sorted_by_name(files),
                    })
                    .collect();
                albums.sort_by(|a, b| natural_cmp(&a.name, &b.name));
                Directory {
                    name: top.to_string(),
                    path: home.join(top).to_string_lossy().into_owned(),
                    albums,
                    files: sorted_by_name(&g.files),
                }
            })
            .collect()
    }

    /// Each group of paths sharing a hash, first-seen path first.
    fn into_duplicates(self) -> Vec<Vec<String>> {
        self.seen.into_values().filter(|p| p.len() > 1).collect()
    }
}

/// Files are added in filesystem order, which is arbitrary; list them by name instead.
fn sorted_by_name(files: &[MediaFile]) -> Vec<MediaFile> {
    let mut files = files.to_vec();
    files.sort_by(|a, b| natural_cmp(&a.name, &b.name));
    files
}

/// Orders names the way people expect: case-insensitive, with runs of digits compared as
/// numbers, so "2 Intro" comes before "10 Outro". Exact ties fall back to byte order.
fn natural_cmp(a: &str, b: &str) -> Ordering {
    let (mut x, mut y) = (a.chars().peekable(), b.chars().peekable());
    loop {
        let ord = match (x.peek().copied(), y.peek().copied()) {
            (None, None) => return a.cmp(b),
            (None, Some(_)) => return Ordering::Less,
            (Some(_), None) => return Ordering::Greater,
            (Some(c), Some(d)) if c.is_ascii_digit() && d.is_ascii_digit() => {
                let (n, m) = (take_digits(&mut x), take_digits(&mut y));
                let (n, m) = (n.trim_start_matches('0'), m.trim_start_matches('0'));
                n.len().cmp(&m.len()).then_with(|| n.cmp(m))
            }
            (Some(c), Some(d)) => {
                x.next();
                y.next();
                c.to_lowercase().cmp(d.to_lowercase())
            }
        };
        if ord != Ordering::Equal {
            return ord;
        }
    }
}

fn take_digits(chars: &mut std::iter::Peekable<std::str::Chars>) -> String {
    let mut digits = String::new();
    while let Some(c) = chars.next_if(char::is_ascii_digit) {
        digits.push(c);
    }
    digits
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

    // Phase 1: walk only the allowed dirs (in parallel) and collect media paths.
    let entries = collect_entries(&home);

    // Phase 2: metadata and hash in parallel, one chunk at a time. Cover art is extracted
    // on demand for the playing track (see art.rs), not here.
    // Phase 3: merge each chunk sequentially in walk order, so "first seen" is deterministic.
    let mut library = Library::default();
    let mut last_progress = Instant::now();
    let mut entries = entries.into_iter();

    loop {
        let chunk: Vec<Entry> = entries.by_ref().take(CHUNK).collect();
        if chunk.is_empty() {
            break;
        }
        let processed: Vec<Processed> = chunk.into_par_iter().map(process).collect();

        for p in processed {
            library.add(p);
        }

        app.emit("scan_count", library.total_files).ok();
        if last_progress.elapsed() >= PROGRESS_INTERVAL {
            app.emit("scan_progress", library.directories(&home)).ok();
            last_progress = Instant::now();
        }
    }

    let directories = library.directories(&home);
    let total_files = library.total_files;
    let duplicates = library.into_duplicates();

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

fn process(entry: Entry) -> Processed {
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
            created_at,
        },
    }
}

/// Hash of file size + first 4 KiB + last 4 KiB. Fast, but a match is a strong hint,
/// not proof: confirm with a full hash if you ever delete files based on it. Also keys the
/// cover-art cache in art.rs.
pub(crate) fn partial_hash(path: &Path, size: u64) -> Option<String> {
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

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn write(path: &Path, data: &[u8]) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, data).unwrap();
    }

    /// Deterministic, non-repeating bytes so head/tail edits change the hash.
    fn bytes(len: usize) -> Vec<u8> {
        (0..len).map(|i| (i * 31 % 251) as u8).collect()
    }

    fn hash_of(dir: &TempDir, name: &str, data: &[u8]) -> Option<String> {
        let path = dir.path().join(name);
        write(&path, data);
        partial_hash(&path, data.len() as u64)
    }

    fn entry(path: &Path, ext: &'static str) -> Entry {
        Entry {
            path: path.to_path_buf(),
            name: path.file_name().unwrap().to_string_lossy().into_owned(),
            ext,
            top: "Music",
            album: None,
        }
    }

    fn processed(
        path: &str,
        top: &'static str,
        album: Option<&str>,
        hash: Option<&str>,
    ) -> Processed {
        Processed {
            top,
            album: album.map(String::from),
            hash: hash.map(String::from),
            file: MediaFile {
                path: path.to_string(),
                name: path.rsplit('/').next().unwrap().to_string(),
                ext: "mp3".to_string(),
                duration_secs: 0.0,
                size_bytes: 0,
                created_at: 0,
            },
        }
    }

    // --- partial_hash ---

    #[test]
    fn identical_files_hash_equal_at_every_size() {
        let dir = TempDir::new().unwrap();
        for len in [0, 1, 100, 4095, 4096, 4097, 8191, 8192, 8193, 100_000] {
            let data = bytes(len);
            let a = hash_of(&dir, &format!("a{len}"), &data);
            let b = hash_of(&dir, &format!("b{len}"), &data);
            assert!(a.is_some(), "len {len}");
            assert_eq!(a, b, "len {len}");
        }
    }

    #[test]
    fn hash_detects_changes_in_head_and_tail() {
        let dir = TempDir::new().unwrap();
        for len in [1, 100, 4096, 4097, 8193, 100_000] {
            let data = bytes(len);
            let original = hash_of(&dir, "orig", &data);

            let mut head = data.clone();
            head[0] ^= 0xFF;
            assert_ne!(original, hash_of(&dir, "head", &head), "head, len {len}");

            let mut tail = data.clone();
            tail[len - 1] ^= 0xFF;
            assert_ne!(original, hash_of(&dir, "tail", &tail), "tail, len {len}");
        }
    }

    #[test]
    fn hash_includes_file_size() {
        // Same first and last 4 KiB, different length.
        let dir = TempDir::new().unwrap();
        assert_ne!(
            hash_of(&dir, "short", &[0u8; 10_000]),
            hash_of(&dir, "long", &[0u8; 12_000])
        );
    }

    #[test]
    fn hash_ignores_the_middle_of_large_files() {
        // Documents the trade-off: only size + head + tail are sampled.
        let dir = TempDir::new().unwrap();
        let mut data = bytes(100_000);
        let original = hash_of(&dir, "orig", &data);
        data[50_000] ^= 0xFF;
        assert_eq!(original, hash_of(&dir, "edited", &data));
    }

    #[test]
    fn hash_of_missing_file_is_none() {
        let dir = TempDir::new().unwrap();
        assert_eq!(partial_hash(&dir.path().join("missing.mp3"), 10), None);
    }

    #[test]
    fn hash_is_none_when_file_is_shorter_than_reported_size() {
        // The file shrank between metadata() and the read.
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("shrunk.mp3");
        write(&path, &bytes(100));
        assert_eq!(partial_hash(&path, 5_000), None);
    }

    // --- collect_entries ---

    #[test]
    fn collects_media_from_allowed_dirs_only() {
        let home = TempDir::new().unwrap();
        for f in [
            "Music/loose.mp3",
            "Music/Album/track.FLAC",
            "Music/Album/itunes.M4A",
            "Music/Album/Disc 1/track.ogg",
            "Music/A/B/C/too_deep.mp3",
            "Music/notes.txt",
            "Music/no_extension",
            "Videos/clip.MKV",
            "Other/skipped.mp3",
            ".hidden/skipped.mp3",
            "in_home.mp3",
        ] {
            write(&home.path().join(f), b"x");
        }

        let mut got: Vec<_> = collect_entries(home.path())
            .into_iter()
            .map(|e| (e.top, e.album, e.name, e.ext))
            .collect();
        got.sort();

        let album = || Some("Album".to_string());
        assert_eq!(
            got,
            vec![
                ("Music", None, "loose.mp3".to_string(), "mp3"),
                ("Music", album(), "itunes.M4A".to_string(), "m4a"),
                ("Music", album(), "track.FLAC".to_string(), "flac"),
                ("Music", album(), "track.ogg".to_string(), "ogg"),
                ("Videos", None, "clip.MKV".to_string(), "mkv"),
            ]
        );
    }

    #[test]
    fn entry_paths_point_into_home() {
        let home = TempDir::new().unwrap();
        let file = home.path().join("Downloads/song.wav");
        write(&file, b"x");
        let entries = collect_entries(home.path());
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].path, file);
        assert_eq!(entries[0].top, "Downloads");
    }

    #[test]
    fn empty_or_missing_home_yields_nothing() {
        let home = TempDir::new().unwrap();
        assert!(collect_entries(home.path()).is_empty());
        assert!(collect_entries(&home.path().join("does-not-exist")).is_empty());
    }

    // --- process ---

    #[test]
    fn process_fills_in_file_metadata() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("Music/song.mp3");
        write(&path, b"not really an mp3");

        let p = process(entry(&path, "mp3"));
        assert_eq!(p.top, "Music");
        assert_eq!(p.hash, partial_hash(&path, 17));
        assert_eq!(p.file.path, path.to_string_lossy());
        assert_eq!(p.file.name, "song.mp3");
        assert_eq!(p.file.ext, "mp3");
        assert_eq!(p.file.size_bytes, 17);
    }

    #[test]
    fn process_of_missing_file_has_no_hash() {
        let dir = TempDir::new().unwrap();
        let p = process(entry(&dir.path().join("gone.mp3"), "mp3"));
        assert_eq!(p.hash, None);
        assert_eq!(p.file.size_bytes, 0);
    }

    // --- Library ---

    #[test]
    fn library_groups_by_top_dir_and_album() {
        let mut lib = Library::default();
        lib.add(processed("/h/Videos/v.mp4", "Videos", None, Some("1")));
        lib.add(processed("/h/Music/B/b.mp3", "Music", Some("B"), Some("2")));
        lib.add(processed("/h/Music/loose.mp3", "Music", None, Some("3")));
        lib.add(processed("/h/Music/A/a.mp3", "Music", Some("A"), Some("4")));

        let dirs = lib.directories(Path::new("/h"));
        let names: Vec<_> = dirs.iter().map(|d| d.name.as_str()).collect();
        assert_eq!(names, ["Music", "Videos"], "directories sorted by name");
        assert_eq!(
            dirs[0].path,
            Path::new("/h").join("Music").to_string_lossy()
        );

        let albums: Vec<_> = dirs[0].albums.iter().map(|a| a.name.as_str()).collect();
        assert_eq!(albums, ["A", "B"], "albums sorted by name");
        assert_eq!(dirs[0].files.len(), 1);
        assert_eq!(dirs[0].files[0].name, "loose.mp3");
        assert_eq!(dirs[1].files.len(), 1);
        assert_eq!(lib.total_files, 4);
    }

    #[test]
    fn library_lists_tracks_by_name_not_walk_order() {
        let mut lib = Library::default();
        for name in [
            "10 Outro.mp3",
            "02 Second.mp3",
            "1 First.mp3",
            "bonus.mp3",
            "Acoustic.mp3",
        ] {
            let path = format!("/h/Music/Album/{name}");
            lib.add(processed(&path, "Music", Some("Album"), None));
        }
        for name in ["zz.mp3", "Aa.mp3"] {
            lib.add(processed(&format!("/h/Music/{name}"), "Music", None, None));
        }
        for album in ["Vol 10", "vol 2"] {
            let path = format!("/h/Music/{album}/a.mp3");
            lib.add(processed(&path, "Music", Some(album), None));
        }

        let dirs = lib.directories(Path::new("/h"));
        let names = |files: &[MediaFile]| files.iter().map(|f| f.name.clone()).collect::<Vec<_>>();
        assert_eq!(
            names(&dirs[0].albums[0].files),
            [
                "1 First.mp3",
                "02 Second.mp3",
                "10 Outro.mp3",
                "Acoustic.mp3",
                "bonus.mp3"
            ]
        );
        assert_eq!(names(&dirs[0].files), ["Aa.mp3", "zz.mp3"]);
        let albums: Vec<_> = dirs[0].albums.iter().map(|a| a.name.as_str()).collect();
        assert_eq!(
            albums,
            ["Album", "vol 2", "Vol 10"],
            "albums in natural order too"
        );
    }

    #[test]
    fn natural_order_compares_numbers_and_ignores_case() {
        let mut names = vec![
            "Track 10",
            "track 2",
            "Track 1",
            "Track 02b",
            "Track",
            "Disc 2 - 01",
            "Disc 10 - 01",
            "disc 2 - 10",
        ];
        names.sort_by(|a, b| natural_cmp(a, b));
        assert_eq!(
            names,
            [
                "Disc 2 - 01",
                "disc 2 - 10",
                "Disc 10 - 01",
                "Track",
                "Track 1",
                "track 2",
                "Track 02b",
                "Track 10"
            ]
        );
        // Exact ties are still ordered, so sorting is deterministic.
        assert_eq!(natural_cmp("01 a", "1 a"), Ordering::Less);
        assert_eq!(natural_cmp("A", "a"), Ordering::Less);
        assert_eq!(natural_cmp("same", "same"), Ordering::Equal);
    }

    #[test]
    fn library_keeps_first_copy_and_records_duplicates() {
        let mut lib = Library::default();
        lib.add(processed("/h/Music/first.mp3", "Music", None, Some("same")));
        lib.add(processed(
            "/h/Downloads/second.mp3",
            "Downloads",
            None,
            Some("same"),
        ));
        lib.add(processed("/h/Music/third.mp3", "Music", None, Some("same")));
        lib.add(processed(
            "/h/Music/unique.mp3",
            "Music",
            None,
            Some("other"),
        ));

        let dirs = lib.directories(Path::new("/h"));
        assert_eq!(dirs.len(), 1, "Downloads only held a duplicate");
        let files: Vec<_> = dirs[0].files.iter().map(|f| f.name.as_str()).collect();
        assert_eq!(files, ["first.mp3", "unique.mp3"]);
        assert_eq!(lib.total_files, 2);

        assert_eq!(
            lib.into_duplicates(),
            vec![vec![
                "/h/Music/first.mp3".to_string(),
                "/h/Downloads/second.mp3".to_string(),
                "/h/Music/third.mp3".to_string(),
            ]]
        );
    }

    #[test]
    fn files_without_a_hash_are_never_deduplicated() {
        let mut lib = Library::default();
        lib.add(processed("/h/Music/a.mp3", "Music", None, None));
        lib.add(processed("/h/Music/b.mp3", "Music", None, None));

        assert_eq!(lib.total_files, 2);
        assert!(lib.into_duplicates().is_empty());
    }

    #[test]
    fn media_file_serializes_with_the_fields_the_frontend_reads() {
        // Keep in sync with `MediaFile` in src/types.ts.
        let json =
            serde_json::to_value(processed("/h/Music/a.mp3", "Music", None, None).file).unwrap();
        let mut keys: Vec<_> = json.as_object().unwrap().keys().cloned().collect();
        keys.sort();
        assert_eq!(
            keys,
            [
                "created_at",
                "duration_secs",
                "ext",
                "name",
                "path",
                "size_bytes"
            ]
        );
    }
}
