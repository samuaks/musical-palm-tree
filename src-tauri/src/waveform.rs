#[derive(serde::Serialize)]
pub struct WaveformData {
    samples: Vec<f32>,
}

#[tauri::command]
pub fn generate_waveform(path: String) -> Result<WaveformData, String> {
    use symphonia::core::audio::SampleBuffer;
    use symphonia::core::codecs::DecoderOptions;
    use symphonia::core::formats::FormatOptions;
    use symphonia::core::io::MediaSourceStream;
    use symphonia::core::meta::MetadataOptions;
    use symphonia::core::probe::Hint;

    let file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    if let Some(ext) = std::path::Path::new(&path)
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
