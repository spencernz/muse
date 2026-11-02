//! Desktop lifecycle. Hiding retains the one webview and the native Rodio thread.
use crate::{db::Result, AppState};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, Window, WindowEvent,
};
use tauri_plugin_notification::NotificationExt;

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum CloseBehavior {
    Background,
    #[default]
    Quit,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preferences {
    close_behavior: CloseBehavior,
    background_available: bool,
}
struct Desktop {
    tray_available: bool,
    pending_fullscreen_hide: AtomicBool,
    #[cfg(target_os = "macos")]
    fullscreen_chrome: AtomicBool,
}

#[tauri::command]
pub fn preferences(app: AppHandle, state: State<'_, AppState>) -> Preferences {
    Preferences {
        close_behavior: state.db.setting("close-behavior").unwrap_or_default(),
        background_available: app.state::<Desktop>().tray_available,
    }
}
#[tauri::command]
pub fn set_close_behavior(
    behavior: CloseBehavior,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<()> {
    if behavior == CloseBehavior::Background && !app.state::<Desktop>().tray_available {
        return Err(
            "The system tray is unavailable. Keep Quit Muse selected and restart Muse to retry."
                .into(),
        );
    }
    state.db.set_setting("close-behavior", &behavior)
}

pub fn show(app: &AppHandle) {
    if let Some(mini) = app.get_webview_window("mini-player") {
        let _ = mini.hide();
    }
    if let Some(desktop) = app.try_state::<Desktop>() {
        desktop
            .pending_fullscreen_hide
            .store(false, Ordering::Release);
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        if let Some(state) = app.try_state::<AppState>() {
            let playback = state.audio.state.lock().ok().map(|value| value.clone());
            if let Some(playback) = playback {
                // Refresh UI after hidden webview timers have been throttled.
                let _ = app.emit("playback-changed", playback);
            }
        }
    }
}

/// Tray activation shows the compact controller when the library is hidden.
fn activate_at(app: &AppHandle, anchor: Option<(tauri::PhysicalPosition<f64>, tauri::Rect)>) {
    let background = app.get_webview_window("main").is_some_and(|window| {
        !window.is_visible().unwrap_or(true) || window.is_minimized().unwrap_or(false)
    });
    if !background {
        show(app);
        return;
    }
    let mini = match app.get_webview_window("mini-player") {
        Some(window) => window,
        None => match tauri::WebviewWindowBuilder::new(
            app,
            "mini-player",
            tauri::WebviewUrl::App("index.html?mini=1".into()),
        )
        .title("Muse mini player")
        .inner_size(380., 200.)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .build()
        {
            Ok(window) => window,
            Err(_) => {
                show(app);
                return;
            }
        },
    };
    if mini.is_visible().unwrap_or(false) {
        let _ = mini.hide();
        return;
    }
    let monitor = anchor
        .as_ref()
        .and_then(|(point, _)| {
            mini.available_monitors().ok()?.into_iter().find(|monitor| {
                let p = monitor.position();
                let size = monitor.size();
                point.x >= p.x as f64
                    && point.x < p.x as f64 + size.width as f64
                    && point.y >= p.y as f64
                    && point.y < p.y as f64 + size.height as f64
            })
        })
        .or_else(|| mini.primary_monitor().ok().flatten());
    if let Some(monitor) = monitor {
        let area = monitor.work_area();
        let scale = monitor.scale_factor();
        let icon = anchor.as_ref().map(|(_, rect)| {
            let position = rect.position.to_physical::<i32>(scale);
            let size = rect.size.to_physical::<u32>(scale);
            (position.x, position.y, size.width, size.height)
        });
        let position = popup_position(
            (
                area.position.x,
                area.position.y,
                area.size.width,
                area.size.height,
            ),
            ((380. * scale).round() as u32, (200. * scale).round() as u32),
            icon,
            (8. * scale).round() as i32,
        );
        let _ = mini.set_position(tauri::PhysicalPosition::new(position.0, position.1));
    }
    let _ = mini.show();
    let _ = mini.set_focus();
    if let Some(state) = app.try_state::<AppState>() {
        if let Ok(playback) = state.audio.state.lock() {
            let _ = app.emit("playback-changed", playback.clone());
        }
    }
}
// Physical coordinates avoid mixing points/pixels across Retina and external monitors.
fn popup_position(
    area: (i32, i32, u32, u32),
    size: (u32, u32),
    icon: Option<(i32, i32, u32, u32)>,
    gap: i32,
) -> (i32, i32) {
    let (left, top, width, height) = area;
    let (w, h) = (size.0 as i32, size.1 as i32);
    let (right, bottom) = (left + width as i32, top + height as i32);
    let (x, y) = if let Some((ix, iy, iw, ih)) = icon {
        let below = iy + ih as i32 + gap;
        (
            ix + iw as i32 / 2 - w / 2,
            if below + h <= bottom - gap {
                below
            } else {
                iy - h - gap
            },
        )
    } else {
        (right - w - gap, bottom - h - gap)
    };
    (
        x.clamp(left + gap, (right - w - gap).max(left + gap)),
        y.clamp(top + gap, (bottom - h - gap).max(top + gap)),
    )
}

#[tauri::command]
pub fn window_fullscreen(window: Window) -> Result<bool> {
    window
        .is_fullscreen()
        .map_err(|_| "Cannot read fullscreen state.".into())
}
#[tauri::command]
pub async fn enter_fullscreen(window: Window) -> Result<()> {
    window
        .set_fullscreen(true)
        .map_err(|_| "Could not enter fullscreen.")?;
    // macOS commits the state after its transition. A quick close must wait for
    // that confirmation before issuing exit, otherwise the late entry can win.
    tauri::async_runtime::spawn_blocking(move || {
        for _ in 0..100 {
            if window
                .is_fullscreen()
                .map_err(|_| "Cannot read fullscreen state.")?
            {
                return Ok(());
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        Err("Fullscreen transition did not finish. Try again.".into())
    })
    .await
    .map_err(|_| "Fullscreen transition unavailable.")?
}
#[tauri::command]
pub fn exit_fullscreen(window: Window) -> Result<()> {
    window
        .set_fullscreen(false)
        .map_err(|_| "Could not exit fullscreen.".into())
}

#[tauri::command]
pub fn show_main_window(app: AppHandle) {
    show(&app);
}
#[tauri::command]
pub fn hide_mini_player(app: AppHandle) {
    if let Some(mini) = app.get_webview_window("mini-player") {
        let _ = mini.hide();
    }
}

pub fn save_playback(app: &AppHandle) {
    if let Some(state) = app.try_state::<AppState>() {
        let playback = state.audio.state.lock().ok().map(|value| value.clone());
        if let Some(playback) = playback {
            // Native snapshot is updated every 200ms; never wait on a webview to quit.
            if let Err(error) = state.db.set_setting("playback", &playback) {
                eprintln!("Could not save playback on exit: {error}");
            }
        }
    }
}

pub fn window_event(window: &Window, event: &WindowEvent) {
    if window.label() == "mini-player" {
        match event {
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = window.hide();
            }
            WindowEvent::Focused(false) => {
                let _ = window.hide();
            }
            _ => {}
        }
        return;
    }
    if window.label() != "main" {
        return;
    }
    if matches!(event, WindowEvent::Resized(_)) {
        if let Ok(fullscreen) = window.is_fullscreen() {
            let _ = window
                .app_handle()
                .emit("native-fullscreen-changed", fullscreen);
            if let Some(desktop) = window.app_handle().try_state::<Desktop>() {
                #[cfg(target_os = "macos")]
                {
                    if desktop.fullscreen_chrome.swap(fullscreen, Ordering::AcqRel) != fullscreen {
                        let style = if fullscreen {
                            tauri::TitleBarStyle::Transparent
                        } else {
                            tauri::TitleBarStyle::Overlay
                        };
                        let _ = window.set_title_bar_style(style);
                    }
                    crate::mac_fullscreen::apply(fullscreen);
                }
                if cfg!(target_os = "macos")
                    && finish_pending_hide(&desktop.pending_fullscreen_hide, fullscreen)
                {
                    hide_to_background(window);
                }
            }
        }
    }
    if let WindowEvent::CloseRequested { api, .. } = event {
        let app = window.app_handle();
        let Some(state) = app.try_state::<AppState>() else {
            return;
        };
        let behavior = state
            .db
            .setting::<CloseBehavior>("close-behavior")
            .unwrap_or_default();
        let available = app.try_state::<Desktop>().is_some_and(|d| d.tray_available);
        api.prevent_close();
        if behavior == CloseBehavior::Background && available {
            if cfg!(target_os = "macos") && window.is_fullscreen().unwrap_or(false) {
                let desktop = app.state::<Desktop>();
                if !desktop.pending_fullscreen_hide.swap(true, Ordering::AcqRel)
                    && window.set_fullscreen(false).is_err()
                {
                    desktop
                        .pending_fullscreen_hide
                        .store(false, Ordering::Release);
                }
            } else {
                hide_to_background(window);
            }
        } else {
            // Explicit exit also terminates on macOS; no close-to-tray exit interception.
            app.exit(0);
        }
    }
}

fn finish_pending_hide(pending: &AtomicBool, fullscreen: bool) -> bool {
    !fullscreen && pending.swap(false, Ordering::AcqRel)
}
fn hide_to_background(window: &Window) {
    let app = window.app_handle();
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    // A failed hide leaves the window accessible rather than destroying it.
    if window.hide().is_ok()
        && !state
            .db
            .setting::<bool>("background-notice-shown")
            .unwrap_or(false)
    {
        match app.notification().builder()
                    .title("Muse is still running")
                    .body("Your music keeps playing in the background. Use the Muse tray or menu bar icon to show Muse or quit.")
                    .show() {
                    Ok(()) => { let _ = state.db.set_setting("background-notice-shown", &true); }
                    Err(error) => eprintln!("Background notification unavailable: {error}"),
                }
    }
}

pub fn setup(app: &mut tauri::App) {
    #[cfg(target_os = "macos")]
    crate::mac_fullscreen::apply(false);
    let result = (|| -> tauri::Result<()> {
        let show_item = MenuItem::with_id(app, "muse-show", "Show Muse", true, None::<&str>)?;
        let toggle = MenuItem::with_id(app, "muse-toggle", "Play/Pause", true, None::<&str>)?;
        let next = MenuItem::with_id(app, "muse-next", "Next", true, None::<&str>)?;
        let previous = MenuItem::with_id(app, "muse-previous", "Previous", true, None::<&str>)?;
        let quit = MenuItem::with_id(app, "muse-quit", "Quit Muse", true, None::<&str>)?;
        let separator = PredefinedMenuItem::separator(app)?;
        let menu = Menu::with_items(
            app,
            &[&show_item, &toggle, &next, &previous, &separator, &quit],
        )?;
        let mut builder = TrayIconBuilder::with_id("muse-tray")
            .tooltip("Muse")
            .menu(&menu)
            .show_menu_on_left_click(false)
            .on_menu_event(|app, event| match event.id().as_ref() {
                "muse-show" => show(app),
                "muse-quit" => app.exit(0),
                id => {
                    let action = match id {
                        "muse-toggle" => "toggle",
                        "muse-next" => "next",
                        "muse-previous" => "previous",
                        _ => return,
                    };
                    app.state::<AppState>().audio.dispatch(action);
                }
            })
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click {
                    position,
                    rect,
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event
                {
                    activate_at(tray.app_handle(), Some((position, rect)));
                }
            });
        if let Some(icon) = app.default_window_icon() {
            builder = builder.icon(icon.clone());
        }
        builder.build(app)?;
        Ok(())
    })();
    if let Err(error) = &result {
        eprintln!("System tray unavailable: {error}");
    }
    app.manage(Desktop {
        tray_available: result.is_ok(),
        pending_fullscreen_hide: AtomicBool::new(false),
        #[cfg(target_os = "macos")]
        fullscreen_chrome: AtomicBool::new(false),
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn mini_popup_anchors_to_icon_and_stays_in_monitor_work_area() {
        assert_eq!(
            popup_position((0, 24, 1440, 876), (380, 200), Some((700, 0, 24, 24)), 8),
            (522, 32)
        );
        assert_eq!(
            popup_position((0, 24, 1440, 876), (380, 200), Some((1410, 0, 24, 24)), 8),
            (1052, 32)
        );
        assert_eq!(
            popup_position((0, 0, 1440, 850), (380, 200), Some((700, 850, 24, 30)), 8),
            (522, 642)
        );
        assert_eq!(
            popup_position(
                (-1920, 48, 1920, 1032),
                (760, 400),
                Some((-40, 0, 40, 48)),
                16
            ),
            (-776, 64)
        );
        assert_eq!(
            popup_position((0, 24, 1440, 876), (380, 200), None, 8),
            (1052, 692)
        );
    }
    #[test]
    fn background_hide_waits_for_fullscreen_exit_and_honours_restore_cancel() {
        let pending = AtomicBool::new(true);
        assert!(!finish_pending_hide(&pending, true));
        assert!(pending.load(Ordering::Acquire));
        assert!(finish_pending_hide(&pending, false));
        assert!(!finish_pending_hide(&pending, false));
        pending.store(true, Ordering::Release);
        pending.store(false, Ordering::Release); // Show Muse cancels the pending close.
        assert!(!finish_pending_hide(&pending, false));
    }
    #[test]
    fn preference_contract_is_stable_and_rejects_unknown_values() {
        assert_eq!(CloseBehavior::default(), CloseBehavior::Quit);
        assert_eq!(
            serde_json::to_string(&CloseBehavior::Background).unwrap(),
            "\"background\""
        );
        assert!(serde_json::from_str::<CloseBehavior>("\"invalid\"").is_err());
        let dir = tempfile::tempdir().unwrap();
        let db = crate::db::Db::new(dir.path()).unwrap();
        db.set_setting("close-behavior", &CloseBehavior::Background)
            .unwrap();
        drop(db);
        let reopened = crate::db::Db::new(dir.path()).unwrap();
        assert_eq!(
            reopened.setting::<CloseBehavior>("close-behavior"),
            Some(CloseBehavior::Background)
        );
    }
}
