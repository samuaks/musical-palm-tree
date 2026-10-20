//! Waveform overview for the player bar: the whole track's loudness as up to `POINTS`
//! values in 0..=1. Decoded with symphonia in constant memory and cached per file.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, Manager};

/// Resolution of the result; the frontend resamples it to however many bars fit.
const POINTS: usize = 1024;
/// Loudness is accumulated in chunks this long (1/20 s) while decoding, so memory stays small
/// for any track length (~45k floats for 38 minutes).
const CHUNKS_PER_SECOND: usize = 20;
/// How many packets to decode between checks for a newer request.
const CANCEL_CHECK_EVERY: usize = 64;

/// Bumped by every request; a decode stops once it's no longer the latest.
static LATEST: AtomicU64 = AtomicU64::new(0);

#[derive(serde::Serialize)]
pub struct WaveformData {
    samples: Vec<f32>,
}

/// Decoding a whole track takes a while, so it runs on a blocking worker (never the main
/// thread), is abandoned when the user moves on to another track, and is cached.
#[tauri::command]
pub async fn generate_waveform(app: AppHandle, path: String) -> Result<WaveformData, String> {
    let request = LATEST.fetch_add(1, Ordering::SeqCst) + 1;
    let cache_dir = app.path().app_cache_dir().ok();
    tauri::async_runtime::spawn_blocking(move || {
        let is_current = || LATEST.load(Ordering::SeqCst) == request;
        waveform(Path::new(&path), cache_dir.as_deref(), is_current)
            .map(|samples| WaveformData { samples })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// The cached waveform if there is one, otherwise decodes the track and caches it.
fn waveform(
    track: &Path,
    cache_dir: Option<&Path>,
    is_current: impl Fn() -> bool,
) -> Result<Vec<f32>, String> {
    let cache = cache_dir.and_then(|dir| cache_path(dir, track));
    if let Some(points) = cache.as_deref().and_then(read_cache) {
        return Ok(points);
    }
    let points = decode_waveform(track, is_current)?;
    if let Some(file) = &cache {
        write_cache(file, &points);
    }
    Ok(points)
}

/// Keyed by the file's content hash; bump the version if the algorithm changes.
fn cache_path(cache_dir: &Path, track: &Path) -> Option<PathBuf> {
    let size = std::fs::metadata(track).ok()?.len();
    let hash = crate::scanner::partial_hash(track, size)?;
    Some(cache_dir.join(format!("wave_v2_{hash}.bin")))
}

/// Little-endian f32s. Anything that doesn't look like our output is ignored (and then
/// regenerated), so a truncated or corrupt file can't break the player.
fn read_cache(file: &Path) -> Option<Vec<f32>> {
    let bytes = std::fs::read(file).ok()?;
    if bytes.is_empty() || bytes.len() % 4 != 0 || bytes.len() / 4 > POINTS {
        return None;
    }
    let points: Vec<f32> = bytes
        .chunks_exact(4)
        .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
        .collect();
    points
        .iter()
        .all(|p| (0.0..=1.0).contains(p))
        .then_some(points)
}

fn write_cache(file: &Path, points: &[f32]) {
    let bytes: Vec<u8> = points.iter().flat_map(|p| p.to_le_bytes()).collect();
    // Write then rename, so a concurrent reader never sees a half-written file.
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let n = NEXT.fetch_add(1, Ordering::Relaxed);
    let tmp = file.with_extension(format!("{}-{n}.tmp", std::process::id()));
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir).ok();
    }
    if std::fs::write(&tmp, bytes).is_ok() {
        std::fs::rename(&tmp, file).ok();
    }
}

/// Decodes the whole track, averaging absolute sample values per chunk as it goes, then
/// reduces the chunks to at most `POINTS` values normalized to the loudest one.
fn decode_waveform(path: &Path, is_current: impl Fn() -> bool) -> Result<Vec<f32>, String> {
    use symphonia::core::audio::{SampleBuffer, SignalSpec};
    use symphonia::core::codecs::DecoderOptions;
    use symphonia::core::formats::FormatOptions;
    use symphonia::core::io::MediaSourceStream;
    use symphonia::core::meta::MetadataOptions;
    use symphonia::core::probe::Hint;

    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            mss,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|e| e.to_string())?;

    let mut format = probed.format;
    let track = format
        .tracks()
        .iter()
        .find(|t| {
            t.codec_params.codec != symphonia::core::codecs::CODEC_TYPE_NULL
                && t.codec_params.sample_rate.is_some()
        })
        .ok_or("no audio track found")?;
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| e.to_string())?;
    let track_id = track.id;
    let frames_per_chunk =
        (track.codec_params.sample_rate.unwrap_or(44_100) as usize / CHUNKS_PER_SECOND).max(1);

    let mut chunks: Vec<f32> = Vec::new();
    let (mut sum, mut count) = (0.0f32, 0usize);
    // Reused across packets; recreated only when a packet needs more room or a new layout.
    let mut buf: Option<(SampleBuffer<f32>, SignalSpec)> = None;

    for packets in 0.. {
        if packets % CANCEL_CHECK_EVERY == 0 && !is_current() {
            return Err("superseded".into());
        }
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(_) => break, // end of stream (or unreadable from here on)
        };
        if packet.track_id() != track_id {
            continue;
        }
        let decoded = match decoder.decode(&packet) {
            Ok(d) => d,
            Err(_) => continue,
        };

        let spec = *decoded.spec();
        let needed = decoded.capacity() * spec.channels.count();
        let fits = matches!(&buf, Some((b, s)) if *s == spec && b.capacity() >= needed);
        if !fits {
            buf = Some((SampleBuffer::new(decoded.capacity() as u64, spec), spec));
        }
        let (sample_buf, _) = buf.as_mut().expect("just set");
        sample_buf.copy_interleaved_ref(decoded);

        let chunk_len = frames_per_chunk * spec.channels.count().max(1);
        for sample in sample_buf.samples() {
            sum += sample.abs();
            count += 1;
            if count == chunk_len {
                chunks.push(sum / count as f32);
                (sum, count) = (0.0, 0);
            }
        }
    }
    if count > 0 {
        chunks.push(sum / count as f32);
    }
    if chunks.is_empty() {
        return Err("no audio decoded".into());
    }

    Ok(normalize(to_points(&chunks)))
}

/// Averages `chunks` down to `POINTS` values; shorter inputs are returned as-is.
fn to_points(chunks: &[f32]) -> Vec<f32> {
    let len = chunks.len();
    if len <= POINTS {
        return chunks.to_vec();
    }
    (0..POINTS)
        .map(|i| {
            let group = &chunks[i * len / POINTS..(i + 1) * len / POINTS];
            group.iter().sum::<f32>() / group.len() as f32
        })
        .collect()
}

fn normalize(points: Vec<f32>) -> Vec<f32> {
    let max = points.iter().copied().fold(0.0f32, f32::max);
    if max > 0.0 {
        points.into_iter().map(|p| p / max).collect()
    } else {
        points // silence: all zeros
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    /// A mono 16-bit PCM WAV at 8 kHz: a 500 Hz square wave whose amplitude (0..=1) at
    /// `t` seconds is `amp(t)`.
    fn wav(seconds: u32, amp: impl Fn(f32) -> f32) -> Vec<u8> {
        let rate = 8000u32;
        let samples: Vec<i16> = (0..rate * seconds)
            .map(|i| {
                let tone = if (i / 8) % 2 == 0 { 1.0 } else { -1.0 };
                (amp(i as f32 / rate as f32) * tone * i16::MAX as f32) as i16
            })
            .collect();
        let data_len = (samples.len() * 2) as u32;
        let mut out = Vec::new();
        out.extend_from_slice(b"RIFF");
        out.extend_from_slice(&(36 + data_len).to_le_bytes());
        out.extend_from_slice(b"WAVEfmt ");
        out.extend_from_slice(&16u32.to_le_bytes()); // fmt chunk size
        out.extend_from_slice(&1u16.to_le_bytes()); // PCM
        out.extend_from_slice(&1u16.to_le_bytes()); // mono
        out.extend_from_slice(&rate.to_le_bytes());
        out.extend_from_slice(&(rate * 2).to_le_bytes()); // byte rate
        out.extend_from_slice(&2u16.to_le_bytes()); // block align
        out.extend_from_slice(&16u16.to_le_bytes()); // bits per sample
        out.extend_from_slice(b"data");
        out.extend_from_slice(&data_len.to_le_bytes());
        for s in samples {
            out.extend_from_slice(&s.to_le_bytes());
        }
        out
    }

    fn write(dir: &TempDir, name: &str, data: &[u8]) -> PathBuf {
        let path = dir.path().join(name);
        std::fs::write(&path, data).unwrap();
        path
    }

    fn mean(points: &[f32]) -> f32 {
        points.iter().sum::<f32>() / points.len() as f32
    }

    #[test]
    fn covers_the_whole_track_not_just_the_first_minute() {
        // Silent for two minutes, then loud: the old 60 s window saw only silence.
        let dir = TempDir::new().unwrap();
        let path = write(
            &dir,
            "late.wav",
            &wav(180, |t| if t < 120.0 { 0.0 } else { 1.0 }),
        );

        let points = decode_waveform(&path, || true).unwrap();
        assert_eq!(points.len(), POINTS);
        let two_thirds = POINTS * 2 / 3;
        assert!(mean(&points[..two_thirds - 5]) < 0.01, "silent start");
        assert!(mean(&points[two_thirds + 5..]) > 0.95, "loud end");
    }

    #[test]
    fn follows_the_loudness() {
        let dir = TempDir::new().unwrap();
        let path = write(&dir, "ramp.wav", &wav(30, |t| t / 30.0));

        let points = decode_waveform(&path, || true).unwrap();
        // 30 s at 20 chunks/s = 600 chunks, fewer than POINTS, so one point per chunk.
        assert_eq!(points.len(), 600);
        assert!(points
            .iter()
            .all(|p| p.is_finite() && (0.0..=1.0).contains(p)));
        assert!(mean(&points[540..]) > mean(&points[..60]) * 5.0);
        assert!(
            points.windows(60).all(|w| w[59] >= w[0] - 0.05),
            "rises steadily"
        );
    }

    #[test]
    fn short_tracks_return_fewer_points() {
        let dir = TempDir::new().unwrap();
        let path = write(&dir, "short.wav", &wav(2, |_| 0.5));
        let points = decode_waveform(&path, || true).unwrap();
        assert_eq!(points.len(), 40);
        assert!(
            points.iter().all(|p| (p - 1.0).abs() < 0.01),
            "constant level"
        );
    }

    #[test]
    fn superseded_requests_stop_decoding() {
        let dir = TempDir::new().unwrap();
        let path = write(&dir, "song.wav", &wav(5, |_| 0.5));
        assert_eq!(
            decode_waveform(&path, || false),
            Err("superseded".to_string())
        );
    }

    #[test]
    fn non_audio_and_missing_files_are_errors() {
        let dir = TempDir::new().unwrap();
        let junk = write(&dir, "junk.mp3", b"definitely not audio");
        assert!(decode_waveform(&junk, || true).is_err());
        assert!(decode_waveform(&dir.path().join("missing.wav"), || true).is_err());
    }

    #[test]
    fn results_are_cached_and_reused() {
        let dir = TempDir::new().unwrap();
        let cache = dir.path().join("cache");
        let path = write(&dir, "song.wav", &wav(3, |_| 0.5));

        let first = waveform(&path, Some(&cache), || true).unwrap();
        let file = cache_path(&cache, &path).unwrap();
        assert!(file
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("wave_v2_"));
        assert_eq!(read_cache(&file), Some(first));

        // A second call returns the cached points without decoding: swap them to prove it.
        write_cache(&file, &[0.25, 0.75]);
        assert_eq!(
            waveform(&path, Some(&cache), || false),
            Ok(vec![0.25, 0.75])
        );
    }

    #[test]
    fn corrupt_cache_is_ignored_and_regenerated() {
        let dir = TempDir::new().unwrap();
        let cache = dir.path().join("cache");
        let path = write(&dir, "song.wav", &wav(3, |_| 0.5));
        let file = cache_path(&cache, &path).unwrap();

        for bad in [vec![1u8, 2, 3], vec![], f32::NAN.to_le_bytes().to_vec()] {
            std::fs::create_dir_all(&cache).unwrap();
            std::fs::write(&file, &bad).unwrap();
            let points = waveform(&path, Some(&cache), || true).unwrap();
            assert_eq!(points.len(), 60, "decoded again for {bad:?}");
            assert_eq!(read_cache(&file), Some(points), "cache rewritten");
        }
    }

    #[test]
    fn to_points_averages_evenly() {
        let chunks: Vec<f32> = (0..POINTS * 3).map(|i| (i / 3) as f32).collect();
        let points = to_points(&chunks);
        assert_eq!(points.len(), POINTS);
        assert!(points
            .iter()
            .enumerate()
            .all(|(i, p)| (*p - i as f32).abs() < 1e-3));
    }
}
