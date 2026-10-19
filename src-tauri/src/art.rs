//! Cover art for the player bar, produced on demand for the track being played: the
//! embedded picture, or else a cover image in the track's folder. Results are cached as
//! small thumbnails and returned as data URLs, so the WebView needs no file access.

use base64::Engine;
use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::ImageFormat;
use lofty::config::ParseOptions;
use lofty::file::TaggedFileExt;
use lofty::picture::{Picture, PictureType};
use lofty::probe::Probe;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Manager};

/// Thumbnails fit in this square; enough for the player bar on high-DPI screens.
const THUMB_SIZE: u32 = 256;
const JPEG_QUALITY: u8 = 85;
/// Folder images, in order of preference, matched case-insensitively.
const FOLDER_NAMES: &[&str] = &["cover", "folder", "front", "album"];
const FOLDER_EXTS: &[&str] = &["jpg", "jpeg", "png"];
/// Extensions a cached cover can have: thumbnails are JPEG, art we can't decode is kept as-is.
const CACHED_EXTS: &[&str] = &["jpg", "png", "gif", "webp", "bmp", "tiff"];

/// The cover for the track at `path` as a `data:` URL, or `None` if it has none.
#[tauri::command]
pub async fn cover_art(app: AppHandle, path: String) -> Result<Option<String>, String> {
    let cache_dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || cover_for(Path::new(&path), &cache_dir))
        .await
        .map_err(|e| e.to_string())
}

/// Deletes the full-size `art_*` files the scanner used to write for every track.
pub fn remove_legacy_cache(app: &AppHandle) {
    let Ok(dir) = app.path().app_cache_dir() else {
        return;
    };
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with("art_") && (name.ends_with(".jpg") || name.ends_with(".none")) {
            std::fs::remove_file(entry.path()).ok();
        }
    }
}

fn cover_for(path: &Path, cache_dir: &Path) -> Option<String> {
    std::fs::create_dir_all(cache_dir).ok()?;
    embedded_cover(path, cache_dir)
        .or_else(|| folder_cover(path, cache_dir))
        .and_then(|cached| data_url(&cached))
}

/// The track's embedded picture, cached by the file's content hash. Tracks without one get a
/// `.none` marker so they aren't parsed again.
fn embedded_cover(path: &Path, cache_dir: &Path) -> Option<PathBuf> {
    let size = std::fs::metadata(path).ok()?.len();
    let stem = format!("cover_{}", crate::scanner::partial_hash(path, size)?);
    if let Some(hit) = find_cached(cache_dir, &stem) {
        return Some(hit);
    }
    let none = cache_dir.join(format!("{stem}.none"));
    if none.exists() {
        return None;
    }

    let tagged = Probe::open(path)
        .ok()? // I/O error: bail without writing a marker, retry next time
        .options(ParseOptions::new().read_properties(false)) // skip duration/bitrate parsing
        .guess_file_type()
        .ok()
        .and_then(|p| p.read().ok());
    let picture = tagged
        .as_ref()
        .and_then(|f| f.primary_tag().or_else(|| f.first_tag()))
        .and_then(|tag| front_cover(tag.pictures()));

    let stored = picture.and_then(|pic| store(cache_dir, &stem, pic.data()));
    if stored.is_none() {
        std::fs::write(&none, b"").ok();
    }
    stored
}

/// The front cover if it's labelled as one, otherwise the first picture.
fn front_cover(pictures: &[Picture]) -> Option<&Picture> {
    pictures
        .iter()
        .find(|p| p.pic_type() == PictureType::CoverFront)
        .or_else(|| pictures.first())
}

/// A cover image next to the track. Never cached as "none", so adding one later works;
/// the cache key includes the image's mtime, so replacing it does too.
fn folder_cover(path: &Path, cache_dir: &Path) -> Option<PathBuf> {
    let image = find_folder_image(path.parent()?)?;
    let meta = std::fs::metadata(&image).ok()?;
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_nanos());
    let key = md5::compute(format!("{}|{}|{modified}", image.display(), meta.len()));
    let stem = format!("cover_dir_{key:x}");
    find_cached(cache_dir, &stem).or_else(|| store(cache_dir, &stem, &std::fs::read(&image).ok()?))
}

fn find_folder_image(dir: &Path) -> Option<PathBuf> {
    let files: Vec<(String, PathBuf)> = std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .filter(|e| e.file_type().is_ok_and(|t| t.is_file()))
        .map(|e| (e.file_name().to_string_lossy().to_lowercase(), e.path()))
        .collect();
    FOLDER_NAMES.iter().find_map(|name| {
        FOLDER_EXTS.iter().find_map(|ext| {
            let wanted = format!("{name}.{ext}");
            files
                .iter()
                .find(|(n, _)| *n == wanted)
                .map(|(_, p)| p.clone())
        })
    })
}

fn find_cached(cache_dir: &Path, stem: &str) -> Option<PathBuf> {
    CACHED_EXTS
        .iter()
        .map(|ext| cache_dir.join(format!("{stem}.{ext}")))
        .find(|p| p.is_file())
}

/// Caches `image` as a JPEG thumbnail, or as-is if it's an image format we can't decode
/// (e.g. WebP or GIF art). Returns `None` if it isn't an image at all.
fn store(cache_dir: &Path, stem: &str, image: &[u8]) -> Option<PathBuf> {
    let (data, ext) = match thumbnail(image) {
        Some(jpeg) => (jpeg, "jpg"),
        None => {
            let format = image::guess_format(image).ok()?;
            (image.to_vec(), *format.extensions_str().first()?)
        }
    };
    let dest = cache_dir.join(format!("{stem}.{ext}"));
    // Write then rename, so a concurrent request never reads a half-written file. The temp
    // name is unique per call, so two requests for the same track can't clobber each other.
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let n = NEXT.fetch_add(1, Ordering::Relaxed);
    let tmp = cache_dir.join(format!("{stem}.{}-{n}.tmp", std::process::id()));
    std::fs::write(&tmp, data).ok()?;
    std::fs::rename(&tmp, &dest).ok()?;
    Some(dest)
}

/// Downscales to fit `THUMB_SIZE` (never upscales) and encodes as JPEG.
fn thumbnail(image: &[u8]) -> Option<Vec<u8>> {
    let mut img = image::load_from_memory(image).ok()?;
    if img.width() > THUMB_SIZE || img.height() > THUMB_SIZE {
        img = img.resize(THUMB_SIZE, THUMB_SIZE, FilterType::Triangle);
    }
    let mut out = Vec::new();
    JpegEncoder::new_with_quality(&mut out, JPEG_QUALITY)
        .encode_image(&img.to_rgb8())
        .ok()?;
    Some(out)
}

fn data_url(path: &Path) -> Option<String> {
    let mime = ImageFormat::from_path(path).ok()?.to_mime_type();
    let data = std::fs::read(path).ok()?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(data);
    Some(format!("data:{mime};base64,{encoded}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{GenericImageView, ImageEncoder, Rgb, RgbImage};
    use lofty::config::WriteOptions;
    use lofty::picture::MimeType;
    use lofty::tag::{Tag, TagExt, TagType};
    use tempfile::TempDir;

    const RED: [u8; 3] = [220, 20, 30];

    fn fixture(name: &str) -> Vec<u8> {
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures")
            .join(name);
        std::fs::read(path).unwrap()
    }

    fn write(path: &Path, data: &[u8]) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, data).unwrap();
    }

    fn png(width: u32, height: u32, color: [u8; 3]) -> Vec<u8> {
        let img = RgbImage::from_pixel(width, height, Rgb(color));
        let mut out = Vec::new();
        image::codecs::png::PngEncoder::new(&mut out)
            .write_image(&img, width, height, image::ExtendedColorType::Rgb8)
            .unwrap();
        out
    }

    fn picture(kind: PictureType, data: Vec<u8>) -> Picture {
        Picture::new_unchecked(kind, Some(MimeType::Png), None, data)
    }

    /// A minimal MP3: an ID3v2 tag holding `pictures`, then a few silent MPEG frames.
    fn mp3_with(pictures: Vec<Picture>) -> Vec<u8> {
        let mut tag = Tag::new(TagType::Id3v2);
        for p in pictures {
            tag.push_picture(p);
        }
        let mut out = Vec::new();
        tag.dump_to(&mut out, WriteOptions::default()).unwrap();
        // MPEG-1 Layer III, 128 kbps, 44.1 kHz: 417-byte frames.
        let mut frame = vec![0u8; 417];
        frame[..4].copy_from_slice(&[0xFF, 0xFB, 0x90, 0x64]);
        for _ in 0..4 {
            out.extend_from_slice(&frame);
        }
        out
    }

    /// Decodes a `data:` URL back into an image.
    fn decode(url: &str) -> image::DynamicImage {
        let (header, b64) = url.split_once(',').expect("data URL");
        assert!(header.starts_with("data:image/"), "{header}");
        assert!(header.ends_with(";base64"), "{header}");
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(b64)
            .unwrap();
        image::load_from_memory(&bytes).unwrap()
    }

    /// Roughly `color`: JPEG is lossy.
    fn assert_color(img: &image::DynamicImage, color: [u8; 3]) {
        let px = img.to_rgb8().get_pixel(img.width() / 2, img.height() / 2).0;
        for (got, want) in px.iter().zip(color) {
            assert!(
                got.abs_diff(want) < 30,
                "pixel {px:?}, expected about {color:?}"
            );
        }
    }

    fn cache_files(dir: &Path) -> Vec<String> {
        let mut names: Vec<_> = std::fs::read_dir(dir)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    // --- embedded art ---

    #[test]
    fn extracts_embedded_art_from_mp3() {
        let dir = TempDir::new().unwrap();
        let track = dir.path().join("Music/song.mp3");
        write(
            &track,
            &mp3_with(vec![picture(PictureType::CoverFront, png(8, 8, RED))]),
        );

        let url = cover_for(&track, &dir.path().join("cache")).expect("cover");
        assert!(url.starts_with("data:image/jpeg;base64,"));
        assert_color(&decode(&url), RED);
    }

    #[test]
    fn extracts_embedded_art_from_flac_and_m4a() {
        // Real-world layouts written by ffmpeg: a FLAC PICTURE block and an MP4 `covr` atom.
        for name in ["cover.flac", "cover.m4a"] {
            let dir = TempDir::new().unwrap();
            let track = dir.path().join(name);
            write(&track, &fixture(name));

            let url = cover_for(&track, &dir.path().join("cache"))
                .unwrap_or_else(|| panic!("no cover from {name}"));
            assert_color(&decode(&url), RED);
        }
    }

    #[test]
    fn extracts_embedded_art_from_ogg() {
        // ffmpeg can't embed Ogg covers, so add one with lofty (METADATA_BLOCK_PICTURE).
        let dir = TempDir::new().unwrap();
        let track = dir.path().join("song.ogg");
        write(&track, &fixture("plain.ogg"));
        let mut tag = Tag::new(TagType::VorbisComments);
        tag.push_picture(picture(PictureType::CoverFront, png(8, 8, RED)));
        tag.save_to_path(&track, WriteOptions::default()).unwrap();

        let url = cover_for(&track, &dir.path().join("cache")).expect("cover");
        assert_color(&decode(&url), RED);
    }

    #[test]
    fn prefers_the_front_cover() {
        let dir = TempDir::new().unwrap();
        let track = dir.path().join("song.mp3");
        let blue = [20, 40, 220];
        write(
            &track,
            &mp3_with(vec![
                picture(PictureType::CoverBack, png(8, 8, blue)),
                picture(PictureType::CoverFront, png(8, 8, RED)),
            ]),
        );
        let url = cover_for(&track, &dir.path().join("cache")).unwrap();
        assert_color(&decode(&url), RED);
    }

    #[test]
    fn falls_back_to_the_first_picture() {
        let dir = TempDir::new().unwrap();
        let track = dir.path().join("song.mp3");
        write(
            &track,
            &mp3_with(vec![picture(PictureType::Other, png(8, 8, RED))]),
        );
        let url = cover_for(&track, &dir.path().join("cache")).unwrap();
        assert_color(&decode(&url), RED);
    }

    // --- folder art ---

    #[test]
    fn uses_a_folder_image_when_nothing_is_embedded() {
        let dir = TempDir::new().unwrap();
        let track = dir.path().join("Album/song.mp3");
        write(&track, b"not really an mp3");
        write(&dir.path().join("Album/Cover.JPG"), &png(8, 8, RED)); // PNG data, odd name

        let url = cover_for(&track, &dir.path().join("cache")).expect("folder cover");
        assert_color(&decode(&url), RED);
    }

    #[test]
    fn folder_image_names_are_tried_in_order() {
        let dir = TempDir::new().unwrap();
        write(&dir.path().join("front.png"), b"x");
        write(&dir.path().join("FOLDER.jpeg"), b"x");
        write(&dir.path().join("notes.txt"), b"x");
        assert_eq!(
            find_folder_image(dir.path()),
            Some(dir.path().join("FOLDER.jpeg"))
        );
        std::fs::create_dir(dir.path().join("cover.jpg")).unwrap(); // a directory isn't a match
        assert_eq!(
            find_folder_image(dir.path()),
            Some(dir.path().join("FOLDER.jpeg"))
        );
    }

    #[test]
    fn embedded_art_beats_folder_art() {
        let dir = TempDir::new().unwrap();
        let track = dir.path().join("Album/song.mp3");
        write(
            &track,
            &mp3_with(vec![picture(PictureType::CoverFront, png(8, 8, RED))]),
        );
        write(
            &dir.path().join("Album/cover.png"),
            &png(8, 8, [20, 200, 40]),
        );
        let url = cover_for(&track, &dir.path().join("cache")).unwrap();
        assert_color(&decode(&url), RED);
    }

    #[test]
    fn folder_image_added_later_is_found() {
        let dir = TempDir::new().unwrap();
        let cache = dir.path().join("cache");
        let track = dir.path().join("Album/song.mp3");
        write(&track, b"not really an mp3");

        assert_eq!(cover_for(&track, &cache), None);
        assert!(cache_files(&cache).iter().any(|n| n.ends_with(".none")));

        write(&dir.path().join("Album/folder.png"), &png(8, 8, RED));
        let url = cover_for(&track, &cache).expect("new folder cover");
        assert_color(&decode(&url), RED);
    }

    // --- caching and thumbnails ---

    #[test]
    fn large_art_is_cached_as_a_small_jpeg() {
        let dir = TempDir::new().unwrap();
        let cache = dir.path().join("cache");
        let track = dir.path().join("song.mp3");
        write(
            &track,
            &mp3_with(vec![picture(PictureType::CoverFront, png(2000, 1000, RED))]),
        );

        let img = decode(&cover_for(&track, &cache).unwrap());
        assert_eq!(img.dimensions(), (256, 128), "fits 256x256, aspect kept");
        let cached: Vec<_> = cache_files(&cache);
        assert_eq!(cached.len(), 1, "{cached:?}");
        assert!(cached[0].starts_with("cover_") && cached[0].ends_with(".jpg"));
    }

    #[test]
    fn small_art_is_not_upscaled() {
        assert_eq!(
            image::load_from_memory(&thumbnail(&png(40, 30, RED)).unwrap())
                .unwrap()
                .dimensions(),
            (40, 30)
        );
    }

    #[test]
    fn art_that_cant_be_decoded_is_kept_as_is() {
        // A GIF header: recognised as an image, but there's no GIF decoder compiled in.
        let gif = b"GIF89a\x01\x00\x01\x00\x00\x00\x00;".to_vec();
        let dir = TempDir::new().unwrap();
        let stored = store(dir.path(), "cover_x", &gif).unwrap();
        assert_eq!(stored, dir.path().join("cover_x.gif"));
        assert_eq!(std::fs::read(&stored).unwrap(), gif);
        assert!(data_url(&stored)
            .unwrap()
            .starts_with("data:image/gif;base64,"));
    }

    #[test]
    fn data_that_isnt_an_image_is_not_stored() {
        let dir = TempDir::new().unwrap();
        assert_eq!(
            store(dir.path(), "cover_x", b"definitely not an image"),
            None
        );
        assert!(cache_files(dir.path()).is_empty());
    }

    #[test]
    fn cached_cover_is_reused_without_parsing() {
        let dir = TempDir::new().unwrap();
        let cache = dir.path().join("cache");
        let track = dir.path().join("song.mp3");
        write(
            &track,
            &mp3_with(vec![picture(PictureType::CoverFront, png(8, 8, RED))]),
        );
        let first = cover_for(&track, &cache).unwrap();

        // Swap the cached thumbnail; a second call must return it rather than re-extract.
        let cached = cache.join(&cache_files(&cache)[0]);
        let green = [20, 200, 40];
        std::fs::write(&cached, thumbnail(&png(8, 8, green)).unwrap()).unwrap();
        let second = cover_for(&track, &cache).unwrap();
        assert_ne!(first, second);
        assert_color(&decode(&second), green);
    }

    #[test]
    fn none_marker_skips_parsing() {
        // The file has real art, but the marker says otherwise, so it isn't read.
        let dir = TempDir::new().unwrap();
        let cache = dir.path().join("cache");
        let track = dir.path().join("song.mp3");
        let data = mp3_with(vec![picture(PictureType::CoverFront, png(8, 8, RED))]);
        write(&track, &data);
        let hash = crate::scanner::partial_hash(&track, data.len() as u64).unwrap();
        write(&cache.join(format!("cover_{hash}.none")), b"");

        assert_eq!(cover_for(&track, &cache), None);
    }

    #[test]
    fn unreadable_file_has_no_cover_and_writes_no_marker() {
        let dir = TempDir::new().unwrap();
        let cache = dir.path().join("cache");
        assert_eq!(cover_for(&dir.path().join("gone.mp3"), &cache), None);
        assert!(cache_files(&cache).is_empty());
    }

    #[test]
    fn non_audio_file_without_folder_art_has_no_cover() {
        let dir = TempDir::new().unwrap();
        let track = dir.path().join("clip.mkv");
        write(&track, b"not really a video");
        assert_eq!(cover_for(&track, &dir.path().join("cache")), None);
    }
}
