#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod api;
mod audio;
mod desktop;
#[tauri::command]
async fn music_request(
    window: tauri::Window,
    state: tauri::State<'_, api::MusicState>,
    action: String,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    if window.label() != "main" {
        return Err("此窗口不允许访问音乐账号".into());
    }
    state.request(&action, &params).await
}
// Test reporter is completely excluded from release builds.
#[cfg(debug_assertions)]
#[tauri::command]
fn smoke_report(window: tauri::Window, mut report: serde_json::Value) -> Result<(), String> {
    if window.label() != "main" {
        return Err("invalid window".into());
    }
    let path = std::env::var("CLOUDMUSIC_SMOKE_REPORT").map_err(|_| "test reporter disabled")?;
    let key = format!("smoke-{}", std::process::id());
    let keyring_ok = keyring::Entry::new("io.yunting.desktop.tests", &key)
        .ok()
        .is_some_and(|entry| {
            if entry.set_password("synthetic-keyring-smoke").is_err() {
                return false;
            }
            let matches = entry
                .get_password()
                .is_ok_and(|v| v == "synthetic-keyring-smoke");
            let deleted = entry.delete_credential().is_ok();
            matches && deleted
        });
    report["checks"]["keyring"] = serde_json::json!(keyring_ok);
    report["ok"] = serde_json::json!(report["ok"] == true && keyring_ok);
    std::fs::write(path, serde_json::to_vec_pretty(&report).unwrap())
        .map_err(|_| "cannot write test report".into())
}
#[cfg(debug_assertions)]
#[tauri::command]
fn smoke_trace(phase: String) {
    if std::env::var_os("CLOUDMUSIC_SMOKE_REPORT").is_some()
        && ["api", "audio-start", "audio-ready", "hidden", "restored"].contains(&phase.as_str())
    {
        eprintln!("smoke phase: {phase}");
    }
}
#[cfg(debug_assertions)]
#[tauri::command]
fn smoke_window_state(window: tauri::Window) -> Result<bool, String> {
    if std::env::var_os("CLOUDMUSIC_SMOKE_REPORT").is_none() {
        return Err("test disabled".into());
    }
    window.is_visible().map_err(|e| e.to_string())
}
#[cfg(debug_assertions)]
#[tauri::command]
fn smoke_second_instance(delay: bool) -> Result<(), String> {
    if std::env::var_os("CLOUDMUSIC_SMOKE_REPORT").is_none() {
        return Err("test disabled".into());
    }
    let executable = std::env::current_exe().map_err(|e| e.to_string())?;
    std::thread::spawn(move || {
        if delay {
            std::thread::sleep(std::time::Duration::from_secs(5));
        }
        if let Ok(mut child) = std::process::Command::new(executable)
            .env_remove("CLOUDMUSIC_SMOKE_REPORT")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
        {
            let _ = child.wait();
        }
    });
    Ok(())
}
fn main() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            desktop::show(app)
        }))
        .manage(api::MusicState::new())
        .manage(audio::AudioCache::new().expect("audio buffer client"))
        .setup(desktop::setup)
        .on_window_event(desktop::on_window_event);
    #[cfg(debug_assertions)]
    let builder = builder.invoke_handler(tauri::generate_handler![
        music_request,
        audio::prepare_audio,
        audio::cancel_audio,
        audio::playback_event,
        desktop::desktop_state,
        desktop::set_close_to_tray,
        desktop::sync_tray,
        desktop::set_ui_zoom,
        smoke_report,
        smoke_trace,
        smoke_window_state,
        smoke_second_instance
    ]);
    #[cfg(not(debug_assertions))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        music_request,
        audio::prepare_audio,
        audio::cancel_audio,
        audio::playback_event,
        desktop::desktop_state,
        desktop::set_close_to_tray,
        desktop::sync_tray,
        desktop::set_ui_zoom
    ]);
    #[cfg(debug_assertions)]
    let builder = builder.on_page_load(|window, payload| {
        if payload.event() == tauri::webview::PageLoadEvent::Finished
            && std::env::var_os("CLOUDMUSIC_SMOKE_REPORT").is_some()
        {
            if std::env::var("CLOUDMUSIC_LONG_AUDIO_SMOKE").as_deref() == Ok("1") {
                let _ = window.eval("window.__cloudmusicLongAudioSmoke = true;");
            }
            let _ = window.eval(include_str!("../../scripts/native-smoke.js"));
        }
    });
    builder
        .run(tauri::generate_context!())
        .expect("无法启动云音乐桌面客户端");
}
