//! App-scoped fullscreen policy; never changes system preferences.
use objc2::MainThreadMarker;
use objc2_app_kit::{NSApplication, NSApplicationPresentationOptions as Options};
use std::sync::Mutex;
static PREVIOUS: Mutex<Option<Options>> = Mutex::new(None);
static WINDOWED: Mutex<Option<Options>> = Mutex::new(None);
fn reveal_options(current: Options) -> Options {
    (current & !(Options::HideMenuBar | Options::HideDock))
        | Options::AutoHideMenuBar
        | Options::AutoHideDock
}
pub fn apply(fullscreen: bool) {
    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    let app = NSApplication::sharedApplication(mtm);
    let Ok(mut previous) = PREVIOUS.lock() else {
        return;
    };
    if fullscreen {
        let before = app.presentationOptions();
        if previous.is_none() {
            *previous = Some(
                WINDOWED
                    .lock()
                    .ok()
                    .and_then(|normal| *normal)
                    .unwrap_or(before & !(Options::FullScreen | Options::AutoHideToolbar)),
            );
        }
        let desired = reveal_options(before);
        // AppKit can finish its own presentation transition after an earlier resize.
        // Re-check at the final resize, but avoid setting unchanged options in a loop.
        let still_disabled = app.isActive()
            && app
                .currentSystemPresentationOptions()
                .intersects(Options::HideMenuBar | Options::HideDock);
        if before != desired || still_disabled {
            app.setPresentationOptions(desired);
        }
    } else {
        if let Some(before) = previous.take() {
            app.setPresentationOptions(before);
        }
        if let Ok(mut normal) = WINDOWED.lock() {
            *normal = Some(app.presentationOptions());
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn fullscreen_menu_reveals_instead_of_being_disabled() {
        for input in [
            Options::Default,
            Options::HideDock | Options::HideMenuBar,
            Options::FullScreen | Options::AutoHideToolbar | Options::HideDock,
        ] {
            let result = reveal_options(input);
            assert!(result.contains(Options::AutoHideMenuBar | Options::AutoHideDock));
            assert!(!result.intersects(Options::HideMenuBar | Options::HideDock));
            assert_eq!(
                result.contains(Options::FullScreen),
                input.contains(Options::FullScreen)
            );
        }
    }
}
