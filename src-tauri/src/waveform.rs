#[derive(serde::Serialize)]
pub struct WaveformData {
    samples: Vec<f32>,
}

/// Decoding takes a moment (longer in debug builds). As a sync command it ran on the main
/// thread and froze the whole window, so it runs on a blocking worker instead.
#[tauri::command]
pub async fn generate_waveform(path: String) -> Result<WaveformData, String> {
    tauri::async_runtime::spawn_blocking(move || decode_waveform(&path))
        .await
        .map_err(|e| e.to_string())?
}

fn decode_waveform(path: &str) -> Result<WaveformData, String> {
    use symphonia::core::audio::SampleBuffer;
    use symphonia::core::codecs::DecoderOptions;
    use symphonia::core::formats::FormatOptions;
    use symphonia::core::io::MediaSourceStream;
    use symphonia::core::meta::MetadataOptions;
    use symphonia::core::probe::Hint;

    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    if let Some(ext) = std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
    {
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
    let mut raw_samples: Vec<f32> = Vec::new();

    // only decode first 60 seconds worth for waveform
    let sample_rate = track.codec_params.sample_rate.unwrap_or(44100) as usize;
    let max_samples = sample_rate * 60;

    loop {
        if raw_samples.len() >= max_samples {
            break;
        }

        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(_) => break,
        };

        if packet.track_id() != track_id {
            continue;
        }

        let decoded = match decoder.decode(&packet) {
            Ok(d) => d,
            Err(_) => continue,
        };

        let mut sample_buf = SampleBuffer::<f32>::new(decoded.capacity() as u64, *decoded.spec());
        sample_buf.copy_interleaved_ref(decoded);
        raw_samples.extend_from_slice(sample_buf.samples());
    }

    // downsample to 100 bars
    let samples = 100;
    let block_size = (raw_samples.len() / samples).max(1);
    let data: Vec<f32> = (0..samples)
        .map(|i| {
            let start = i * block_size;
            let end = (start + block_size).min(raw_samples.len());
            raw_samples[start..end].iter().map(|s| s.abs()).sum::<f32>() / block_size as f32
        })
        .collect();

    let max = data.iter().cloned().fold(0.0_f32, f32::max);
    let normalized = if max > 0.0 {
        data.iter().map(|v| v / max).collect()
    } else {
        vec![0.5; samples]
    };

    Ok(WaveformData {
        samples: normalized,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    /// A mono 16-bit PCM WAV whose loudness ramps up over `seconds`.
    fn ramp_wav(seconds: u32) -> Vec<u8> {
        let rate = 8000u32;
        let samples: Vec<i16> = (0..rate * seconds)
            .map(|i| {
                let amp = i as f32 / (rate * seconds) as f32;
                let tone = if (i / 8) % 2 == 0 { 1.0 } else { -1.0 }; // 500 Hz square wave
                (amp * tone * i16::MAX as f32) as i16
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

    #[test]
    fn decodes_into_100_bars_following_the_loudness() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("ramp.wav");
        std::fs::write(&path, ramp_wav(10)).unwrap();

        let bars = decode_waveform(path.to_str().unwrap()).unwrap().samples;
        assert_eq!(bars.len(), 100);
        assert!(bars.iter().all(|b| b.is_finite() && *b >= 0.0));
        let (first, last) = (
            bars[..10].iter().sum::<f32>(),
            bars[90..].iter().sum::<f32>(),
        );
        assert!(last > first * 3.0, "quiet start {first}, loud end {last}");
    }

    #[test]
    fn non_audio_and_missing_files_are_errors() {
        let dir = TempDir::new().unwrap();
        let junk = dir.path().join("junk.mp3");
        std::fs::write(&junk, b"definitely not audio").unwrap();
        assert!(decode_waveform(junk.to_str().unwrap()).is_err());
        assert!(decode_waveform(dir.path().join("missing.wav").to_str().unwrap()).is_err());
    }
}
