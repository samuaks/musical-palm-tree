mod online;
mod scanner;
mod waveform;
mod ytdlp;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            tauri::async_runtime::spawn(ytdlp::auto_update(app.handle().clone()));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scanner::scan_media,
            waveform::generate_waveform,
            ytdlp::yt_dlp_status,
            ytdlp::install_yt_dlp,
            online::search_online,
            online::resolve_stream,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
