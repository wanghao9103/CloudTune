use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager,
};

pub struct DesktopState {
    close_to_tray: AtomicBool,
    tray_created: bool,
    title: MenuItem<tauri::Wry>,
    play: MenuItem<tauri::Wry>,
    previous: MenuItem<tauri::Wry>,
    next: MenuItem<tauri::Wry>,
}

pub fn show(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn tray_host_available() -> bool {
    dbus::blocking::Connection::new_session()
        .ok()
        .is_some_and(|connection| {
            connection
                .with_proxy(
                    "org.freedesktop.DBus",
                    "/org/freedesktop/DBus",
                    Duration::from_millis(300),
                )
                .method_call::<(bool,), _, _, _>(
                    "org.freedesktop.DBus",
                    "NameHasOwner",
                    ("org.kde.StatusNotifierWatcher",),
                )
                .map(|(owned,)| owned)
                .unwrap_or(false)
        })
}

pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let title = MenuItem::with_id(app, "track", "CloudTune · 等待播放", false, None::<&str>)?;
    let show_item = MenuItem::with_id(app, "show", "显示CloudTune", true, None::<&str>)?;
    let play = MenuItem::with_id(app, "toggle", "播放", false, None::<&str>)?;
    let previous = MenuItem::with_id(app, "previous", "上一首", false, None::<&str>)?;
    let next = MenuItem::with_id(app, "next", "下一首", false, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出CloudTune", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(
        app,
        &[
            &title, &show_item, &separator, &play, &previous, &next, &quit,
        ],
    )?;
    let tray_created = TrayIconBuilder::with_id("yunting")
        .icon(app.default_window_icon().ok_or("缺少应用图标")?.clone())
        .tooltip("CloudTune")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show(app),
            "quit" => app.exit(0),
            action @ ("toggle" | "previous" | "next") => {
                let _ = app.emit_to("main", "tray-control", action);
            }
            _ => {}
        })
        .build(app)
        .is_ok();
    let close_to_tray = app
        .path()
        .app_config_dir()
        .ok()
        .and_then(|dir| std::fs::read(dir.join("desktop.json")).ok())
        .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok())
        .and_then(|v| v["closeToTray"].as_bool())
        .unwrap_or(true);
    app.manage(DesktopState {
        close_to_tray: AtomicBool::new(close_to_tray),
        tray_created,
        title,
        play,
        previous,
        next,
    });
    Ok(())
}

pub fn on_window_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    if window.label() != "main" {
        return;
    }
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        let state = window.state::<DesktopState>();
        if state.close_to_tray.load(Ordering::Relaxed) && state.tray_created {
            // Without a tray host, retain the taskbar entry so the app stays reachable.
            let result = if tray_host_available() {
                window.hide()
            } else {
                window.minimize()
            };
            if result.is_ok() {
                api.prevent_close();
            }
        }
    }
}

#[tauri::command]
pub fn desktop_state(
    window: tauri::Window,
    state: tauri::State<'_, DesktopState>,
) -> Result<serde_json::Value, String> {
    require_main(&window)?;
    Ok(
        serde_json::json!({"closeToTray": state.close_to_tray.load(Ordering::Relaxed), "trayCreated": state.tray_created, "trayHost": tray_host_available()}),
    )
}

#[tauri::command]
pub fn set_close_to_tray(
    window: tauri::Window,
    state: tauri::State<'_, DesktopState>,
    enabled: bool,
) -> Result<(), String> {
    require_main(&window)?;
    let dir = window.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(
        dir.join("desktop.json"),
        serde_json::json!({"closeToTray": enabled}).to_string(),
    )
    .map_err(|e| e.to_string())?;
    state.close_to_tray.store(enabled, Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
pub fn sync_tray(
    window: tauri::Window,
    state: tauri::State<'_, DesktopState>,
    title: String,
    playing: bool,
    ready: bool,
    can_skip: bool,
) -> Result<(), String> {
    require_main(&window)?;
    let title: String = title.chars().filter(|c| !c.is_control()).take(70).collect();
    state
        .title
        .set_text(if title.is_empty() {
            "CloudTune · 等待播放".into()
        } else {
            format!("CloudTune · {title}")
        })
        .map_err(|e| e.to_string())?;
    state
        .play
        .set_text(if playing { "暂停" } else { "播放" })
        .map_err(|e| e.to_string())?;
    state.play.set_enabled(ready).map_err(|e| e.to_string())?;
    state
        .previous
        .set_enabled(can_skip)
        .map_err(|e| e.to_string())?;
    state
        .next
        .set_enabled(can_skip)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_ui_zoom(window: tauri::WebviewWindow, scale: f64) -> Result<(), String> {
    if window.label() != "main" || ![0.9, 1.0, 1.1, 1.25].contains(&scale) {
        return Err("不支持的缩放比例".into());
    }
    window.set_zoom(scale).map_err(|e| e.to_string())
}

fn require_main(window: &tauri::Window) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("此窗口不允许设置桌面状态".into())
    }
}
