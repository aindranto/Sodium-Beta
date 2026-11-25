use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use tauri::webview::{
    DownloadEvent, NewWindowResponse, PermissionKind, PermissionResponse, WebviewBuilder,
};
use tauri::{Emitter, LogicalPosition, LogicalSize, Manager, State, WebviewUrl, WindowEvent};

/// Width of the sidebar rendered by Sodium's own UI (ui/index.html).
const SIDEBAR_W: f64 = 76.0;

/// Height of the top bar rendered by Sodium's own UI (ui/index.html):
/// active service name, zoom controls and the "Hidup bareng" setting.
const TOPBAR_H: f64 = 44.0;

/// Height of the link bar the UI shows above the link popup.
const LINKBAR_H: f64 = 40.0;

/// Label of the link-popup webview. Deliberately not "service-"-prefixed:
/// it is not a service (no eviction, no profile-per-service rules).
const POPUP_LABEL: &str = "link-popup";

/// Width reserved for the AI panel (Sodium Beta experiment): a
/// native Gemini chat column the UI draws at the right edge of the
/// window. While it is open, the service area shrinks by this much.
const AI_PANEL_W: f64 = 380.0;

/// Label of the webview that renders Sodium's own UI inside the main window.
const UI_LABEL: &str = "ui";

#[derive(Default)]
struct AppState {
    /// Labels of alive service webviews, most-recently-used first.
    alive_mru: Mutex<Vec<String>>,
    /// Service ids the user pinned: exempt from eviction (e.g. WhatsApp,
    /// so its notifications keep working).
    pinned: Mutex<HashSet<String>>,
    /// User setting: how many non-pinned service webviews may be alive at
    /// the same time. 1 = lightest (default). 0 = unlimited (Ferdium-like,
    /// RAM grows with every service opened).
    max_alive: Mutex<usize>,
    /// Browser-style page zoom per service (service id -> scale,
    /// 1.0 = 100%). Each service remembers its own zoom; services without
    /// an entry use 100%.
    zoom: Mutex<HashMap<String, f64>>,
    /// Label of the service webview currently shown. Alive service
    /// webviews are stacked native controls, so exactly one may be
    /// visible at a time: this one.
    active: Mutex<Option<String>>,
    /// Whether the link popup is currently open over the active service.
    link_open: Mutex<bool>,
    /// Folder the Save As dialog starts in: the user's Downloads folder
    /// at first, then the last folder a download was saved to.
    download_dir: std::sync::Arc<Mutex<std::path::PathBuf>>,
    /// The main window, created in the setup hook as a plain `tauri::Window`
    /// (not a WebviewWindow) because only `Window` can host child webviews
    /// via `add_child`.
    main_window: Mutex<Option<tauri::Window>>,
    /// True once the tray icon exists; only then may closing the
    /// window mean hiding it (otherwise the app would be stranded).
    tray_ok: std::sync::atomic::AtomicBool,
    /// The active YouTube adblock script: the newest copy the UI
    /// downloaded from the repo, or the bundled fallback. Injected
    /// into YouTube service webviews when they are created.
    adblock_script: Mutex<String>,
    /// Whether the YouTube adblock is switched on (UI setting,
    /// pushed to Rust at startup and whenever the switch flips).
    adblock_enabled: Mutex<bool>,
    /// Whether the AI panel is currently open (Sodium Beta). While
    /// true, service webviews are laid out AI_PANEL_W narrower.
    ai_open: Mutex<bool>,
}

/// The YouTube adblock script bundled with the app: the fallback
/// until the UI downloads a newer one from the repo (the script
/// lives in adblock/ at the repo root so it can be updated without
/// an app release).
const BUNDLED_YT_ADBLOCK: &str = include_str!("../../adblock/youtube.js");

/// youtube.com and any of its subdomains (www., m., music., ...).
fn is_youtube_host(host: &str) -> bool {
    host == "youtube.com" || host.ends_with(".youtube.com")
}

fn label_for(id: &str) -> String {
    format!("service-{id}")
}

fn id_from_label(label: &str) -> &str {
    label.strip_prefix("service-").unwrap_or(label)
}

/// Service ids are minted by the UI (catalog slugs, "<slug>-<n>"
/// clones, "custom-<base36>"): lowercase letters, digits, dashes.
/// Anything else is rejected before it can reach a filesystem path.
fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id.bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

/// Only web URLs may be loaded into a service or popup webview.
fn valid_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    lower.starts_with("https://") || lower.starts_with("http://")
}

fn logical_inner_size(window: &tauri::Window) -> LogicalSize<f64> {
    let size = window
        .inner_size()
        .unwrap_or(tauri::PhysicalSize { width: 1280, height: 800 });
    let scale = window.scale_factor().unwrap_or(1.0);
    LogicalSize::new(size.width as f64 / scale, size.height as f64 / scale)
}

/// Bounds for Sodium's own UI webview: the full window.
fn full_bounds(window: &tauri::Window) -> (LogicalPosition<f64>, LogicalSize<f64>) {
    (LogicalPosition::new(0.0, 0.0), logical_inner_size(window))
}

/// Bounds for a service webview: right of the sidebar, below the top
/// bar. While the AI panel is open, the area is AI_PANEL_W narrower
/// so the panel docks beside the service instead of covering it.
fn service_bounds(window: &tauri::Window, ai_open: bool) -> (LogicalPosition<f64>, LogicalSize<f64>) {
    let size = logical_inner_size(window);
    let mut w = size.width.max(SIDEBAR_W + 100.0);
    let h = size.height.max(TOPBAR_H + 100.0);
    if ai_open {
        w = (w - AI_PANEL_W).max(SIDEBAR_W + 100.0);
    }
    (
        LogicalPosition::new(SIDEBAR_W, TOPBAR_H),
        LogicalSize::new(w - SIDEBAR_W, h - TOPBAR_H),
    )
}

/// Reposition the active service webview (if any) for the current
/// AI-panel state. Called whenever the panel opens or closes.
fn relayout_active_service(app: &tauri::AppHandle, state: &AppState) {
    let window = state.main_window.lock().unwrap().clone();
    let Some(window) = window else { return };
    let ai_open = *state.ai_open.lock().unwrap();
    let active = state.active.lock().unwrap().clone();
    if let Some(label) = active {
        if let Some(wv) = app.get_webview(&label) {
            let (pos, size) = service_bounds(&window, ai_open);
            let _ = wv.set_position(pos);
            let _ = wv.set_size(size);
        }
    }
}

/// Download handler for a service or popup webview: without it,
/// downloads silently go nowhere. Answers with the native Save As
/// dialog (Downloads first, then the last folder used) and reports
/// start/finish to the UI for its indicator and history.
fn make_download_handler(
    app: tauri::AppHandle,
    download_dir: std::sync::Arc<Mutex<std::path::PathBuf>>,
    source: String,
) -> impl Fn(tauri::Webview, DownloadEvent) -> bool + Send + Sync + 'static {
    move |_webview, event| {
        match event {
            DownloadEvent::Requested { destination, .. } => {
                let suggested = destination
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .filter(|n| !n.trim().is_empty())
                    .unwrap_or_else(|| "sodium-download".to_string());
                let start_dir = download_dir.lock().unwrap().clone();
                let mut dialog = rfd::FileDialog::new().set_file_name(&suggested);
                if !start_dir.as_os_str().is_empty() {
                    dialog = dialog.set_directory(&start_dir);
                }
                match dialog.save_file() {
                    Some(path) => {
                        if let Some(parent) = path.parent() {
                            *download_dir.lock().unwrap() = parent.to_path_buf();
                        }
                        let name = path
                            .file_name()
                            .map(|n| n.to_string_lossy().into_owned())
                            .unwrap_or(suggested);
                        *destination = path;
                        let _ = app.emit_to(UI_LABEL, "download-started", name);
                        true
                    }
                    None => false,
                }
            }
            DownloadEvent::Finished { path, success, .. } => {
                let saved = if success {
                    path.as_ref().map(|p| p.to_string_lossy().into_owned())
                } else {
                    None
                };
                let _ = app.emit_to(
                    UI_LABEL,
                    "download-finished",
                    (saved, source.clone(), success),
                );
                true
            }
            _ => true,
        }
    }
}

/// Global shortcuts owned by Sodium: Ctrl+1..9 (switch service) and
/// Alt+Space (quick switcher). They are registered only while the
/// Sodium window is focused (and released on blur, so other apps keep
/// their keys): keydown events inside a service webview never reach
/// Sodium's own UI, so without this the shortcuts would be dead
/// exactly while the user is chatting.
fn focus_shortcuts() -> Vec<tauri_plugin_global_shortcut::Shortcut> {
    use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};
    let mut list: Vec<Shortcut> = [
        Code::Digit1,
        Code::Digit2,
        Code::Digit3,
        Code::Digit4,
        Code::Digit5,
        Code::Digit6,
        Code::Digit7,
        Code::Digit8,
        Code::Digit9,
    ]
    .iter()
    .map(|c| Shortcut::new(Some(Modifiers::CONTROL), *c))
    .collect();
    list.push(Shortcut::new(Some(Modifiers::ALT), Code::Space));
    list
}

fn shortcut_index(code: tauri_plugin_global_shortcut::Code) -> Option<usize> {
    use tauri_plugin_global_shortcut::Code;
    match code {
        Code::Digit1 => Some(0),
        Code::Digit2 => Some(1),
        Code::Digit3 => Some(2),
        Code::Digit4 => Some(3),
        Code::Digit5 => Some(4),
        Code::Digit6 => Some(5),
        Code::Digit7 => Some(6),
        Code::Digit8 => Some(7),
        Code::Digit9 => Some(8),
        _ => None,
    }
}

/// Unread count from a service page title: the first "(n)" in the
/// first 40 characters — "(3) WhatsApp", "Inbox (3)", "Kotak Masuk
/// (3)". Capped at 999 so title years like "(2024)" read as 0.
fn parse_unread(title: &str) -> usize {
    let head: String = title.chars().take(40).collect();
    let Some(open) = head.find('(') else { return 0 };
    let rest = &head[open + 1..];
    let Some(close) = rest.find(')') else { return 0 };
    let inner = &rest[..close];
    if inner.is_empty() || !inner.bytes().all(|b| b.is_ascii_digit()) {
        return 0;
    }
    inner.parse().ok().filter(|&n| n <= 999).unwrap_or(0)
}

/// Saved main-window geometry (logical pixels), restored on startup so
/// Sodium reopens where and how big the user left it.
#[derive(serde::Serialize, serde::Deserialize)]
struct WindowStateFile {
    width: f64,
    height: f64,
    x: Option<f64>,
    y: Option<f64>,
}

fn load_window_state(app: &tauri::AppHandle) -> Option<WindowStateFile> {
    let path = app.path().app_data_dir().ok()?.join("window-state.json");
    let text = std::fs::read_to_string(path).ok()?;
    let saved: WindowStateFile = serde_json::from_str(&text).ok()?;
    if saved.width < 900.0 || saved.height < 600.0 || saved.width > 10000.0 || saved.height > 10000.0
    {
        return None;
    }
    if let (Some(x), Some(y)) = (saved.x, saved.y) {
        if x < -10000.0 || x > 10000.0 || y < -10000.0 || y > 10000.0 {
            return None;
        }
    }
    Some(saved)
}

fn save_window_state(app: &tauri::AppHandle, window: &tauri::Window) {
    let (Ok(size), Ok(pos)) = (window.inner_size(), window.outer_position()) else {
        return;
    };
    let scale = window.scale_factor().unwrap_or(1.0);
    let saved = WindowStateFile {
        width: size.width as f64 / scale,
        height: size.height as f64 / scale,
        x: Some(pos.x as f64 / scale),
        y: Some(pos.y as f64 / scale),
    };
    if let Ok(dir) = app.path().app_data_dir() {
        let _ = std::fs::create_dir_all(&dir);
        if let Ok(text) = serde_json::to_string(&saved) {
            let _ = std::fs::write(dir.join("window-state.json"), text);
        }
    }
}

/// Bounds for the link popup: floating over the content area with a
/// margin on every side, below the top bar and the UI's link bar.
fn popup_bounds(window: &tauri::Window) -> (LogicalPosition<f64>, LogicalSize<f64>) {
    let size = logical_inner_size(window);
    let x = SIDEBAR_W + 24.0;
    let y = TOPBAR_H + LINKBAR_H + 16.0;
    let w = (size.width - x - 24.0).max(200.0);
    let h = (size.height - y - 24.0).max(200.0);
    (LogicalPosition::new(x, y), LogicalSize::new(w, h))
}

/// Create one service webview (not yet shown): its own profile
/// folder, link clicks diverted to the popup, downloads handled,
/// title changes forwarded as unread counts.
fn create_service_webview(
    app: &tauri::AppHandle,
    state: &AppState,
    window: &tauri::Window,
    id: &str,
    url: &str,
) -> Result<(), String> {
    let label = label_for(id);
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("profiles")
        .join(id);
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let parsed = tauri::Url::parse(url).map_err(|e| e.to_string())?;
    // Links that ask for a new window (target=_blank, window.open)
    // would be silently dropped by WebView2. Deny the window and
    // tell the UI instead: it shows the link popup over the service.
    let app_for_links = app.clone();
    let app_for_title = app.clone();
    let id_for_title = id.to_string();
    let mut builder = WebviewBuilder::new(&label, WebviewUrl::External(parsed.clone()))
        .data_directory(data_dir)
        // Tauri's own drop handler replaces WebView2's on Windows,
        // so dropped files would never reach the page (no attaching
        // files in WhatsApp). Disabling it lets the page handle drops.
        .disable_drag_drop_handler()
        .on_new_window(move |u, _features| {
            let _ = app_for_links.emit_to(UI_LABEL, "link-clicked", u.to_string());
            NewWindowResponse::Deny
        })
        .on_download(make_download_handler(
            app.clone(),
            state.download_dir.clone(),
            id.to_string(),
        ))
        .on_document_title_changed(move |_wv, title| {
            let count = parse_unread(&title);
            let _ = app_for_title.emit_to(
                UI_LABEL,
                "unread-changed",
                (id_for_title.clone(), count),
            );
        });
    // YouTube adblock: YouTube services get the adblock script as an
    // initialization script (it runs before the page's own scripts).
    // Webviews that are already alive are not touched — the script
    // applies from the next time the service is created.
    if *state.adblock_enabled.lock().unwrap() {
        if let Some(host) = parsed.host_str() {
            if is_youtube_host(host) {
                let script = state.adblock_script.lock().unwrap().clone();
                if !script.is_empty() {
                    builder = builder.initialization_script(script);
                }
            }
        }
    }
    let (pos, size) = service_bounds(window, *state.ai_open.lock().unwrap());
    window
        .add_child(builder, pos, size)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Create a pinned service's webview at startup without showing
/// it, so its notifications work from boot. Async for the same
/// WebView2 reason as switch_service.
#[tauri::command]
async fn start_service_hidden(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
    url: String,
) -> Result<(), String> {
    if !valid_id(&id) {
        return Err("invalid service id".into());
    }
    if !valid_url(&url) {
        return Err("invalid service url".into());
    }
    let label = label_for(&id);
    if app.get_webview(&label).is_some() {
        return Ok(());
    }
    let window = state
        .main_window
        .lock()
        .unwrap()
        .clone()
        .ok_or("main window missing")?;
    create_service_webview(&app, &state, &window, &id, &url)?;
    if let Some(wv) = app.get_webview(&label) {
        let z = state.zoom.lock().unwrap().get(&id).copied().unwrap_or(1.0);
        let _ = wv.set_zoom(z);
        let _ = wv.hide();
    }
    let mut mru = state.alive_mru.lock().unwrap();
    if !mru.contains(&label) {
        mru.push(label);
    }
    Ok(())
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// System tray icon: left-click brings the window back, the menu
/// offers Buka/Keluar. Quitting only happens from that menu —
/// closing the window hides it instead (see on_window_event).
fn build_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
    let open_item = MenuItem::with_id(app, "tray-open", "Buka Sodium Beta", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "tray-quit", "Keluar", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_item, &quit_item])?;
    let mut builder = TrayIconBuilder::with_id("main-tray")
        .tooltip("Sodium Beta")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "tray-open" => show_main_window(app),
            "tray-quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

/// Switch to a service. Over the "Hidup bareng" limit, the
/// least-recently-used non-pinned webview is destroyed (sessions
/// survive in its on-disk profile). Async on purpose: creating a
/// webview from a sync command can deadlock on Windows.
#[tauri::command]
async fn switch_service(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
    url: String,
) -> Result<(), String> {
    if !valid_id(&id) {
        return Err("invalid service id".into());
    }
    if !valid_url(&url) {
        return Err("invalid service url".into());
    }
    let label = label_for(&id);
    let window = state
        .main_window
        .lock()
        .unwrap()
        .clone()
        .ok_or("main window missing")?;

    if app.get_webview(&label).is_none() {
        // Make room first: creating first and evicting after would
        // peak at limit+1 webviews (and their RAM) for a moment.
        if !state.pinned.lock().unwrap().contains(&id) {
            let max = *state.max_alive.lock().unwrap();
            if max > 0 {
                evict_down_to(&app, &state, max - 1);
            }
        }
        create_service_webview(&app, &state, &window, &id, &url)?;
    } else if let Some(wv) = app.get_webview(&label) {
        let (pos, size) = service_bounds(&window, *state.ai_open.lock().unwrap());
        let _ = wv.set_position(pos);
        let _ = wv.set_size(size);
        let _ = wv.set_focus();
    }

    // Apply this service's own zoom level to the (possibly just created)
    // webview.
    if let Some(wv) = app.get_webview(&label) {
        let z = state.zoom.lock().unwrap().get(&id).copied().unwrap_or(1.0);
        let _ = wv.set_zoom(z);
    }

    // Native webviews stack with the newest on top, so show only
    // the target and hide the rest — otherwise the covering webview
    // keeps hiding the one switched to.
    *state.active.lock().unwrap() = Some(label.clone());
    for wv in app.webviews().values() {
        if wv.label() == label {
            let _ = wv.show();
        } else if wv.label().starts_with("service-") {
            let _ = wv.hide();
        }
    }

    {
        let mut mru = state.alive_mru.lock().unwrap();
        mru.retain(|l| l != &label);
        mru.insert(0, label.clone());
    }

    evict_over_limit(&app, &state);
    Ok(())
}

/// Destroy least-recently-used non-pinned webviews while more of
/// them are alive than the user's "Hidup bareng" limit. Called after
/// every switch and immediately when the limit itself changes, so
/// lowering the limit takes effect at once instead of on the next
/// switch.
fn evict_over_limit(app: &tauri::AppHandle, state: &AppState) {
    let max_alive = *state.max_alive.lock().unwrap();
    if max_alive == 0 {
        return;
    }
    evict_down_to(app, state, max_alive);
}

/// Destroy LRU non-pinned webviews until at most `target` remain.
fn evict_down_to(app: &tauri::AppHandle, state: &AppState, target: usize) {
    loop {
        let victim: Option<String> = {
            let mru = state.alive_mru.lock().unwrap();
            let pinned = state.pinned.lock().unwrap();
            let non_pinned: Vec<&String> = mru
                .iter()
                .filter(|l| !pinned.contains(id_from_label(l)))
                .collect();
            if non_pinned.len() <= target {
                None
            } else {
                // Last non-pinned in MRU order = least recently used.
                non_pinned.last().map(|s| (*s).clone())
            }
        };
        match victim {
            Some(v) => {
                if let Some(wv) = app.get_webview(&v) {
                    let _ = wv.close();
                }
                // A destroyed webview has no live count: clear its
                // badge instead of leaving a stale number behind.
                let _ = app.emit_to(
                    UI_LABEL,
                    "unread-changed",
                    (id_from_label(&v).to_string(), 0usize),
                );
                state.alive_mru.lock().unwrap().retain(|l| l != &v);
            }
            None => break,
        }
    }
}

/// Hide or show all alive service webviews while a UI panel is
/// open: native webviews layer above the UI, so they would cover
/// the panel. Hiding is not destroying; sessions stay alive.
#[tauri::command]
fn set_services_visible(app: tauri::AppHandle, state: State<'_, AppState>, visible: bool) {
    let active = state.active.lock().unwrap().clone();
    let link_open = *state.link_open.lock().unwrap();
    for wv in app.webviews().values() {
        if wv.label().starts_with("service-") {
            // "visible" means "panels closed": bring back only the active
            // service, never the whole stack — and while the link popup
            // is open, the services stay hidden behind it.
            if visible && !link_open && active.as_deref() == Some(wv.label()) {
                let _ = wv.show();
            } else {
                let _ = wv.hide();
            }
        } else if wv.label() == POPUP_LABEL {
            if visible && link_open {
                let _ = wv.show();
            } else {
                let _ = wv.hide();
            }
        }
    }
}

/// Open the link popup over the active service, or navigate it if it is
/// already open. The active service webview is hidden while the popup is
/// open: the UI's link bar sits in the strip above the popup and would
/// otherwise be covered by the (native) service webview.
/// Async for the same WebView2 reason as switch_service.
#[tauri::command]
async fn open_link_popup(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    url: String,
) -> Result<(), String> {
    if !valid_url(&url) {
        return Err("invalid url".into());
    }
    let window = state
        .main_window
        .lock()
        .unwrap()
        .clone()
        .ok_or("main window missing")?;
    let parsed = tauri::Url::parse(&url).map_err(|e| e.to_string())?;
    *state.link_open.lock().unwrap() = true;
    let active = state.active.lock().unwrap().clone();
    if let Some(active_label) = &active {
        if let Some(wv) = app.get_webview(active_label) {
            let _ = wv.hide();
        }
    }
    if let Some(wv) = app.get_webview(POPUP_LABEL) {
        let _ = wv.navigate(parsed);
        let (pos, size) = popup_bounds(&window);
        let _ = wv.set_position(pos);
        let _ = wv.set_size(size);
        let _ = wv.show();
    } else {
        let data_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("profiles")
            .join("link-popup");
        std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
        let app_for_links = app.clone();
        let builder = WebviewBuilder::new(POPUP_LABEL, WebviewUrl::External(parsed))
            .data_directory(data_dir)
            .disable_drag_drop_handler()
            .on_new_window(move |u, _features| {
                let _ = app_for_links.emit_to(UI_LABEL, "link-clicked", u.to_string());
                NewWindowResponse::Deny
            })
            .on_download(make_download_handler(
                app.clone(),
                state.download_dir.clone(),
                "link-popup".to_string(),
            ));
        let (pos, size) = popup_bounds(&window);
        window
            .add_child(builder, pos, size)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Close the link popup and bring the active service back.
#[tauri::command]
fn close_link_popup(app: tauri::AppHandle, state: State<'_, AppState>) {
    *state.link_open.lock().unwrap() = false;
    if let Some(wv) = app.get_webview(POPUP_LABEL) {
        let _ = wv.close();
    }
    let active = state.active.lock().unwrap().clone();
    if let Some(active_label) = &active {
        if let Some(wv) = app.get_webview(active_label) {
            let _ = wv.show();
        }
    }
}

/// Open a link in the user's default browser (the link bar's escape
/// hatch). http/https only, passed as a single argument (no shell).
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    let parsed = tauri::Url::parse(&url).map_err(|e| e.to_string())?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("only http/https links can be opened externally".into());
    }
    std::process::Command::new("explorer")
        .arg(parsed.as_str())
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Launch a downloaded Sodium installer, then exit so the installer
/// can replace the running app. Only existing .exe files are
/// accepted; the path comes from the app's own download history,
/// never from free-form input.
#[tauri::command]
fn run_installer(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let p = std::path::PathBuf::from(&path);
    let is_exe = p
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("exe"))
        .unwrap_or(false);
    if !is_exe || !p.is_file() {
        return Err("installer file not found".into());
    }
    if let Some(window) = app.get_window("main") {
        save_window_state(&app, &window);
    }
    std::process::Command::new(&p)
        .spawn()
        .map_err(|e| e.to_string())?;
    app.exit(0);
    Ok(())
}

/// Destroy one service's webview and forget it (used when the user
/// deletes the service from the sidebar).
#[tauri::command]
fn close_service(app: tauri::AppHandle, state: State<'_, AppState>, id: String) {
    let label = label_for(&id);
    if let Some(wv) = app.get_webview(&label) {
        let _ = wv.close();
    }
    let _ = app.emit_to(UI_LABEL, "unread-changed", (id.clone(), 0usize));
    state.alive_mru.lock().unwrap().retain(|l| l != &label);
    let mut active = state.active.lock().unwrap();
    if active.as_deref() == Some(label.as_str()) {
        *active = None;
    }
    drop(active);
    // Delete the profile folder too: it holds cookies and session
    // tokens that must not outlive the service. WebView2 can keep
    // the files locked briefly after the webview closes, so a
    // failed first attempt retries in the background.
    if valid_id(&id) {
        if let Ok(dir) = app.path().app_data_dir() {
            let profile = dir.join("profiles").join(&id);
            if profile.exists() && std::fs::remove_dir_all(&profile).is_err() {
                std::thread::spawn(move || {
                    for _ in 0..5 {
                        std::thread::sleep(std::time::Duration::from_secs(2));
                        if !profile.exists() || std::fs::remove_dir_all(&profile).is_ok() {
                            break;
                        }
                    }
                });
            }
        }
    }
}

/// Destroy one service's webview and forget it, but KEEP its
/// profile folder (session survives). Used by config import, where
/// a removed or re-URLed service must stop running without losing
/// the login it may need again if the config is re-imported.
#[tauri::command]
fn close_webview(app: tauri::AppHandle, state: State<'_, AppState>, id: String) {
    let label = label_for(&id);
    if let Some(wv) = app.get_webview(&label) {
        let _ = wv.close();
    }
    let _ = app.emit_to(UI_LABEL, "unread-changed", (id.clone(), 0usize));
    state.alive_mru.lock().unwrap().retain(|l| l != &label);
    let mut active = state.active.lock().unwrap();
    if active.as_deref() == Some(label.as_str()) {
        *active = None;
    }
}

#[tauri::command]
fn set_pinned(app: tauri::AppHandle, state: State<'_, AppState>, id: String, pinned: bool) {
    {
        let mut set = state.pinned.lock().unwrap();
        if pinned {
            set.insert(id);
        } else {
            set.remove(&id);
        }
    }
    // Unpinning can put the alive count over the limit; evict now
    // instead of waiting for the next switch.
    if !pinned {
        evict_over_limit(&app, &state);
    }
}

/// Set how many non-pinned services may be alive at once. 0 = unlimited.
#[tauri::command]
fn set_max_alive(app: tauri::AppHandle, state: State<'_, AppState>, max: usize) {
    *state.max_alive.lock().unwrap() = max;
    evict_over_limit(&app, &state);
}

/// Set the page zoom for one service (1.0 = 100%). Stored per service so
/// a newly created webview gets its own service's zoom, and applied at
/// once when that service's webview is already alive.
#[tauri::command]
fn set_service_zoom(app: tauri::AppHandle, state: State<'_, AppState>, id: String, scale: f64) {
    state.zoom.lock().unwrap().insert(id.clone(), scale);
    if let Some(wv) = app.get_webview(&label_for(&id)) {
        let _ = wv.set_zoom(scale);
    }
}

#[tauri::command]
fn alive_services(state: State<'_, AppState>) -> Vec<String> {
    state.alive_mru.lock().unwrap().clone()
}

/// Reload the active service's page (a hung WhatsApp Web tab
/// otherwise needs a service round-trip to recover).
#[tauri::command]
fn reload_service(app: tauri::AppHandle, state: State<'_, AppState>) {
    let active = state.active.lock().unwrap().clone();
    if let Some(label) = active {
        if let Some(wv) = app.get_webview(&label) {
            let _ = wv.reload();
        }
    }
}

/// Show a downloaded file selected in Explorer.
#[tauri::command]
fn reveal_file(path: String) -> Result<(), String> {
    std::process::Command::new("explorer")
        .arg(format!("/select,\"{path}\""))
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Replace the active YouTube adblock script (the UI downloaded a
/// newer one from the repo). Applies to service webviews created
/// after this call; alive ones keep the script they started with.
#[tauri::command]
fn set_adblock_script(state: State<'_, AppState>, script: String) {
    *state.adblock_script.lock().unwrap() = script;
}

/// Switch the YouTube adblock on or off (applies at webview
/// creation, like the script itself).
#[tauri::command]
fn set_adblock_enabled(state: State<'_, AppState>, enabled: bool) {
    *state.adblock_enabled.lock().unwrap() = enabled;
}

// ---------------------------------------------------------------------
// AI panel (Sodium Beta only): a NATIVE Gemini chat drawn by the UI
// itself in a right-hand column — there is no AI webview anymore.
// Rust only reserves the layout space (ai_set_open) and provides
// the "screen context" extraction: the active service's visible
// text, which the UI attaches to the next Gemini API request,
// because the Gemini API cannot see inside a service webview.
// ---------------------------------------------------------------------

/// Run a script in a webview via WebView2's ExecuteScript and wait
/// for its result (the JSON-encoded return value). Tauri's own
/// `eval` is fire-and-forget, so this goes through webview2-com:
/// `with_webview` runs the call on the main thread, the completion
/// handler sends the result over a channel, and the caller waits
/// for it on a blocking thread — never on the main thread, so the
/// UI cannot deadlock waiting for its own message pump.
#[cfg(windows)]
async fn run_script_with_result(
    wv: tauri::Webview,
    script: String,
) -> Result<String, String> {
    use std::sync::mpsc;
    use webview2_com::ExecuteScriptCompletedHandler;
    use windows_core::PCWSTR;

    let (tx, rx) = mpsc::channel::<Result<String, String>>();
    let queued = wv.with_webview(move |platform| {
        let tx_handler = tx.clone();
        let outcome = (move || -> Result<(), String> {
            let core = unsafe { platform.controller().CoreWebView2() }
                .map_err(|e| e.to_string())?;
            let wide: Vec<u16> = script.encode_utf16().chain(std::iter::once(0)).collect();
            let handler = ExecuteScriptCompletedHandler::create(Box::new(
                move |error: windows_core::Result<()>, result: String| {
                    let msg = error.map(|_| result).map_err(|e| e.to_string());
                    let _ = tx_handler.send(msg);
                    Ok(())
                },
            ));
            unsafe { core.ExecuteScript(PCWSTR(wide.as_ptr()), &handler) }
                .map_err(|e| e.to_string())?;
            Ok(())
        })();
        if let Err(e) = outcome {
            let _ = tx.send(Err(e));
        }
    });
    if let Err(e) = queued {
        return Err(e.to_string());
    }
    tauri::async_runtime::spawn_blocking(move || {
        rx.recv_timeout(std::time::Duration::from_secs(10))
            .map_err(|_| "script timed out".to_string())?
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Non-Windows fallback: Sodium ships for Windows only, this just
/// keeps the crate compiling elsewhere.
#[cfg(not(windows))]
async fn run_script_with_result(
    _wv: tauri::Webview,
    _script: String,
) -> Result<String, String> {
    Err("AI panel context bridge is Windows-only".into())
}

/// Record whether the native AI panel is open and relayout the
/// active service webview: the service area shrinks by AI_PANEL_W
/// while the panel is open and returns to full width when it
/// closes. The panel itself is pure UI — no webview is created.
#[tauri::command]
fn ai_set_open(app: tauri::AppHandle, state: State<'_, AppState>, open: bool) {
    *state.ai_open.lock().unwrap() = open;
    relayout_active_service(&app, &state);
}

/// Extract the active service's visible text for the AI panel:
/// page title + URL + innerText, assembled into the context block
/// the UI attaches to the next Gemini request.
#[tauri::command]
async fn ai_extract_context(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let active = state.active.lock().unwrap().clone();
    let Some(label) = active else {
        return Err("Tidak ada layanan aktif".into());
    };
    let Some(wv) = app.get_webview(&label) else {
        return Err("Tidak ada layanan aktif".into());
    };
    let script = "(function(){var t=(document.body&&document.body.innerText)||\"\";return JSON.stringify({title:document.title||\"\",url:location.href,text:t.slice(0,20000)})})()";
    let raw = run_script_with_result(wv, script.to_string()).await?;
    // ExecuteScript returns the script's value JSON-encoded: here a
    // JSON string whose content is itself JSON, so unwrap twice.
    let inner: String = serde_json::from_str(&raw).unwrap_or(raw);
    let parsed: serde_json::Value =
        serde_json::from_str(&inner).map_err(|e| e.to_string())?;
    let title = parsed.get("title").and_then(|v| v.as_str()).unwrap_or("");
    let url = parsed.get("url").and_then(|v| v.as_str()).unwrap_or("");
    let text = parsed.get("text").and_then(|v| v.as_str()).unwrap_or("");
    let name = if title.is_empty() {
        id_from_label(&label).to_string()
    } else {
        title.to_string()
    };
    let mut out = format!("[Konteks layar Sodium — layanan: {name}, alamat: {url}]\n{text}");
    // Keep the attached context a sane size for a chat prompt.
    if out.chars().count() > 12000 {
        out = out.chars().take(12000).collect();
    }
    Ok(out)
}

/// Read the durable settings file (config.json), if it exists.
/// The UI keeps its working copy in localStorage, which dies with
/// the webview profile data; this file survives that.
#[tauri::command]
fn load_config(app: tauri::AppHandle) -> Option<String> {
    let path = app.path().app_data_dir().ok()?.join("config.json");
    std::fs::read_to_string(path).ok()
}

/// Write the settings file atomically (temp file + rename), so a
/// crash mid-write cannot corrupt the only copy.
#[tauri::command]
fn save_config(app: tauri::AppHandle, data: String) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let tmp = dir.join("config.json.tmp");
    std::fs::write(&tmp, data).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, dir.join("config.json")).map_err(|e| e.to_string())?;
    Ok(())
}

/// Export the settings snapshot to a JSON file the user picks.
/// Returns false when the dialog was cancelled.
#[tauri::command]
fn export_config(data: String) -> Result<bool, String> {
    let Some(path) = rfd::FileDialog::new()
        .set_file_name("sodium-config.json")
        .add_filter("JSON", &["json"])
        .save_file()
    else {
        return Ok(false);
    };
    std::fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(true)
}

/// Import a settings snapshot from a JSON file the user picks.
/// Returns None when the dialog was cancelled.
#[tauri::command]
fn import_config() -> Result<Option<String>, String> {
    let Some(path) = rfd::FileDialog::new()
        .add_filter("JSON", &["json"])
        .pick_file()
    else {
        return Ok(None);
    };
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(Some(text))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Single instance: a second launch must not fight the first one
        // over the same WebView2 profile folders (they are locked per
        // process). Focus the existing window instead. This plugin has
        // to be registered first.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    use tauri_plugin_global_shortcut::{Code, Modifiers, ShortcutState};
                    if event.state() == ShortcutState::Pressed {
                        if shortcut.key == Code::Space && shortcut.mods == Modifiers::ALT {
                            let _ = app.emit_to(UI_LABEL, "quick-switch", ());
                        } else if let Some(idx) = shortcut_index(shortcut.key) {
                            let _ = app.emit_to(UI_LABEL, "shortcut-switch", idx);
                        }
                    }
                })
                .build(),
        )
        .manage(AppState {
            max_alive: Mutex::new(1),
            zoom: Mutex::new(HashMap::new()),
            adblock_script: Mutex::new(BUNDLED_YT_ADBLOCK.to_string()),
            adblock_enabled: Mutex::new(true),
            ..Default::default()
        })
        .setup(|app| {
            // The main window is built here as a plain `tauri::Window`
            // (tauri.conf.json declares no windows) because only `Window`
            // supports `add_child`; a config-created window is a
            // WebviewWindow, which cannot host service webviews.
            let mut win_builder = tauri::window::WindowBuilder::new(app, "main")
                .title("Sodium Beta")
                .inner_size(1280.0, 800.0)
                .min_inner_size(900.0, 600.0);
            if let Some(saved) = load_window_state(app.handle()) {
                win_builder = win_builder.inner_size(saved.width, saved.height);
                if let (Some(x), Some(y)) = (saved.x, saved.y) {
                    win_builder = win_builder.position(x, y);
                }
            }
            let window = win_builder.build()?;
            {
                use tauri_plugin_global_shortcut::GlobalShortcutExt;
                let _ = app
                    .handle()
                    .global_shortcut()
                    .register_multiple(focus_shortcuts());
            }
            let size = window.inner_size()?;
            let state = app.state::<AppState>();
            // The UI webview gets the download handler too (source
            // "sodium-update") so update installers download inside
            // Sodium instead of opening the system browser.
            let ui_builder = WebviewBuilder::new(UI_LABEL, WebviewUrl::App("index.html".into()))
                .on_download(make_download_handler(
                    app.handle().clone(),
                    state.download_dir.clone(),
                    "sodium-update".to_string(),
                ));
            window.add_child(ui_builder, LogicalPosition::new(0.0, 0.0), size)?;
            *state.main_window.lock().unwrap() = Some(window);
            if let Ok(dir) = app.path().download_dir() {
                *state.download_dir.lock().unwrap() = dir;
            }
            if build_tray(app.handle()).is_ok() {
                state
                    .tray_ok
                    .store(true, std::sync::atomic::Ordering::Relaxed);
            }
            Ok(())
        })
        // Allow notification requests (unanswered, WebView2 denies
        // them — WhatsApp's "turn on notifications" could never be
        // enabled before this); everything else keeps the default.
        .on_permission_request(|_, kind| match kind {
            PermissionKind::Notifications => PermissionResponse::Allow,
            _ => PermissionResponse::Default,
        })
        .invoke_handler(tauri::generate_handler![
            switch_service,
            start_service_hidden,
            set_services_visible,
            close_service,
            close_webview,
            set_pinned,
            set_max_alive,
            set_service_zoom,
            open_link_popup,
            close_link_popup,
            open_external,
            run_installer,
            alive_services,
            reload_service,
            reveal_file,
            load_config,
            save_config,
            export_config,
            import_config,
            set_adblock_script,
            set_adblock_enabled,
            ai_set_open,
            ai_extract_context
        ])
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            {
                use tauri_plugin_global_shortcut::GlobalShortcutExt;
                match event {
                    // Ctrl+1..9 and Alt+Space belong to Sodium only
                    // while its window is focused; release them when
                    // it blurs.
                    WindowEvent::Focused(true) => {
                        let _ = window
                            .app_handle()
                            .global_shortcut()
                            .register_multiple(focus_shortcuts());
                    }
                    WindowEvent::Focused(false) => {
                        let _ = window
                            .app_handle()
                            .global_shortcut()
                            .unregister_multiple(focus_shortcuts());
                    }
                    WindowEvent::CloseRequested { api, .. } => {
                        save_window_state(&window.app_handle(), window);
                        // With a tray icon, closing hides the window:
                        // services keep running (and notifying) in
                        // the background. Real exit is the tray
                        // menu's "Keluar".
                        let handle = window.app_handle();
                        let state = handle.state::<AppState>();
                        if state.tray_ok.load(std::sync::atomic::Ordering::Relaxed) {
                            api.prevent_close();
                            let _ = window.hide();
                        }
                    }
                    _ => {}
                }
            }
            if let WindowEvent::Resized(_) = event {
                let app = window.app_handle();
                let ai_open = *app.state::<AppState>().ai_open.lock().unwrap();
                let (ui_pos, ui_size) = full_bounds(window);
                let (pos, size) = service_bounds(window, ai_open);
                for wv in app.webviews().values() {
                    if wv.label() == UI_LABEL {
                        let _ = wv.set_position(ui_pos);
                        let _ = wv.set_size(ui_size);
                    } else if wv.label() == POPUP_LABEL {
                        let (ppos, psize) = popup_bounds(window);
                        let _ = wv.set_position(ppos);
                        let _ = wv.set_size(psize);
                    } else if wv.label().starts_with("service-") {
                        let _ = wv.set_position(pos);
                        let _ = wv.set_size(size);
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Sodium");
}

#[cfg(test)]
mod tests {
    use super::parse_unread;

    #[test]
    fn unread_from_titles() {
        assert_eq!(parse_unread("(3) WhatsApp"), 3);
        assert_eq!(parse_unread("Inbox (12) - Gmail"), 12);
        assert_eq!(parse_unread("Kotak Masuk (3) - a@b.com"), 3);
        assert_eq!(parse_unread("(2024) Rekap"), 0);
        assert_eq!(parse_unread("WhatsApp"), 0);
    }
}
