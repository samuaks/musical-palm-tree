mod scanner;
mod waveform;
mod online;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            scanner::scan_media,
            waveform::generate_waveform,
            online::search_online,
            online::resolve_stream,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}