// Sodium UI - no framework, no bundler. Sidebar + service picker.
// The heavy lifting (creating / destroying webviews) happens in Rust:
// see src-tauri/src/lib.rs -> switch_service()

// Catalog of popular services with their official web apps, shown in the
// picker (first run, and whenever "+" is clicked). "slug" points into
// ICON_PATHS (icons.js, Simple Icons paths): the service renders as the
// real brand logo, drawn in the service's iconColor on its colour tile.
// Entries without a slug are not in Simple Icons (Tokopedia, Lazada,
// OpenAI/ChatGPT) and render a generic glyph instead ("glyph" key into
// GLYPHS, icons.js). No emoji anywhere since v0.8.0.
const CATALOG = [
  { id: "whatsapp",  name: "WhatsApp",        url: "https://web.whatsapp.com/",        color: "#1faa55", slug: "whatsapp" },
  { id: "telegram",  name: "Telegram",        url: "https://web.telegram.org/k/",      color: "#229ed9", slug: "telegram" },
  { id: "instagram", name: "Instagram",       url: "https://www.instagram.com/",       color: "#c13584", slug: "instagram" },
  { id: "messenger", name: "Messenger",       url: "https://www.messenger.com/",       color: "#0084ff", slug: "messenger" },
  { id: "discord",   name: "Discord",         url: "https://discord.com/channels/@me", color: "#5865f2", slug: "discord" },
  { id: "gmail",     name: "Gmail",           url: "https://mail.google.com/",         color: "#d93025", slug: "gmail" },
  { id: "facebook",  name: "Facebook",        url: "https://www.facebook.com/",        color: "#1877f2", slug: "facebook" },
  { id: "tiktok",    name: "TikTok",          url: "https://www.tiktok.com/",          color: "#161823", slug: "tiktok" },
  { id: "youtube",   name: "YouTube",         url: "https://www.youtube.com/",         color: "#ff0000", slug: "youtube" },
  { id: "twitter",   name: "X (Twitter)",     url: "https://x.com/",                   color: "#14171a", slug: "x" },
  { id: "slack",     name: "Slack",           url: "https://app.slack.com/client",     color: "#611f69", slug: "slack" },
  { id: "teams",     name: "Microsoft Teams", url: "https://teams.microsoft.com/",     color: "#4b53bc", slug: "microsoftteams" },
  { id: "gcal",      name: "Google Calendar", url: "https://calendar.google.com/",     color: "#4285f4", slug: "googlecalendar" },
  { id: "spotify",   name: "Spotify",         url: "https://open.spotify.com/",        color: "#1db954", slug: "spotify" },
  { id: "github",    name: "GitHub",          url: "https://github.com/",              color: "#24292e", slug: "github" },
  { id: "linkedin",  name: "LinkedIn",        url: "https://www.linkedin.com/",        color: "#0a66c2", slug: "linkedin" },
  { id: "reddit",    name: "Reddit",          url: "https://www.reddit.com/",          color: "#ff4500", slug: "reddit" },
  { id: "pinterest", name: "Pinterest",       url: "https://www.pinterest.com/",       color: "#e60023", slug: "pinterest" },
  { id: "netflix",   name: "Netflix",         url: "https://www.netflix.com/",         color: "#b20710", slug: "netflix" },
  { id: "tokopedia", name: "Tokopedia",       url: "https://www.tokopedia.com/",       color: "#42b549", glyph: "bag" },
  { id: "shopee",    name: "Shopee",          url: "https://shopee.co.id/",            color: "#ee4d2d", slug: "shopee" },
  { id: "lazada",    name: "Lazada",          url: "https://www.lazada.co.id/",        color: "#0f146d", glyph: "bag" },
  { id: "blibli",    name: "Blibli",          url: "https://www.blibli.com/",          color: "#0072ff", slug: "blibli" },
  { id: "bukalapak", name: "Bukalapak",       url: "https://www.bukalapak.com/",       color: "#e31e52", slug: "bukalapak" },
  { id: "threads",   name: "Threads",         url: "https://www.threads.net/",         color: "#14171a", slug: "threads" },
  { id: "chatgpt",   name: "ChatGPT",         url: "https://chatgpt.com/",             color: "#10a37f", glyph: "chat" },
  { id: "gemini",    name: "Google Gemini",   url: "https://gemini.google.com/",       color: "#8e75b2", slug: "googlegemini" },
  { id: "claude",    name: "Claude",          url: "https://claude.ai/",               color: "#d97757", slug: "claude" },
  { id: "notion",    name: "Notion",          url: "https://www.notion.so/",           color: "#14161a", slug: "notion" },
  { id: "zoom",      name: "Zoom",            url: "https://zoom.us/",                 color: "#2d8cff", slug: "zoom" },
  { id: "gdrive",    name: "Google Drive",    url: "https://drive.google.com/",        color: "#0066da", slug: "googledrive" },
];


const DEFAULT_SERVICES = [
  // WhatsApp is pre-added; everything else comes from the picker.
  { id: "whatsapp", name: "WhatsApp", url: "https://web.whatsapp.com/", icon: "Wa", color: "#1faa55", brand: "whatsapp", iconColor: "#ffffff" },
];

const store = {
  load() {
    try { return JSON.parse(localStorage.getItem("sodium.services")) || structuredClone(DEFAULT_SERVICES); }
    catch { return structuredClone(DEFAULT_SERVICES); }
  },
  save(list) { localStorage.setItem("sodium.services", JSON.stringify(list)); scheduleConfigSave(); },
  pinned() {
    try { return new Set(JSON.parse(localStorage.getItem("sodium.pinned") || "[]")); }
    catch { return new Set(); }
  },
  savePinned(set) { localStorage.setItem("sodium.pinned", JSON.stringify([...set])); scheduleConfigSave(); },
  disabled() {
    try { return new Set(JSON.parse(localStorage.getItem("sodium.disabled") || "[]")); }
    catch { return new Set(); }
  },
  saveDisabled(set) { localStorage.setItem("sodium.disabled", JSON.stringify([...set])); scheduleConfigSave(); },
};

// Durable mirror of the local settings in config.json on the Rust
// side: localStorage is the working copy, but it dies with the
// webview profile data; config.json survives that. Saves are
// debounced and revisioned; at startup a newer config.json wins.
const CFG_KEYS = ["sodium.services", "sodium.pinned", "sodium.disabled", "sodium.showNames", "sodium.lastActive", "sodium.onboarded", "sodium.zoom", "sodium.zoomByService", "sodium.maxAlive", "sodium.downloads", "sodium.lastUpdateCheck", "sodium.iconSize", "sodium.ytAdblock", "sodium.ytAdblockInfo", "sodium.ytAdblockScript", "sodium.geminiKey", "sodium.geminiModel"];
let cfgRev = parseInt(localStorage.getItem("sodium.cfgRev") || "0", 10) || 0;
let cfgTimer = null;
let applyingConfig = false;
function scheduleConfigSave() {
  if (applyingConfig) return;
  clearTimeout(cfgTimer);
  cfgTimer = setTimeout(() => {
    cfgRev += 1;
    localStorage.setItem("sodium.cfgRev", String(cfgRev));
    const data = {};
    for (const k of CFG_KEYS) {
      const v = localStorage.getItem(k);
      if (v !== null) data[k] = v;
    }
    invoke("save_config", { data: JSON.stringify({ rev: cfgRev, data }) }).catch(() => {});
  }, 250);
}

let services = store.load();
// Unread counts per service id, reported by Rust from page titles
// ("(3) WhatsApp"). Only alive webviews report; Rust sends 0 when a
// webview is closed or evicted, so a badge never shows a stale count.
const unread = new Map();
let pinned = store.pinned();
let disabled = store.disabled();
let activeId = null;
let showNames = localStorage.getItem("sodium.showNames") === "1";
// Sidebar icon size (40/48/56 px button): a CSS variable the
// stylesheet reads, so low-resolution screens can shrink the icons.
let iconSize = parseInt(localStorage.getItem("sodium.iconSize") || "48", 10) || 48;
function applyIconSize() {
  document.documentElement.style.setProperty("--svc", iconSize + "px");
  document.documentElement.style.setProperty("--svc-sm", Math.round(iconSize * 28 / 48) + "px");
}
function svcGlyphPx() { return Math.round(iconSize * 26 / 48); }
applyIconSize();

const nav = document.getElementById("services");
const { invoke } = window.__TAURI__.core;
const el = (id) => document.getElementById(id);

function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; }
}

// A service's group name (free text set in the Kelola panel);
// "" means ungrouped. Groups only affect sidebar separators,
// the quick switcher captions and "Mulai kelompok".
function groupOf(s) {
  return (s && s.group ? String(s.group) : "").trim();
}

// One-time migrations for services stored by older versions: adopt
// the catalog colour when missing, adopt the real brand logo (or the
// catalog glyph) when the service's URL matches a catalog entry and
// the user has not customised the icon, and — since v0.8.0 dropped
// emoji icons — turn a stored emoji icon on a brand-less service
// into the name's initials (brand services render their logo anyway
// and are left untouched).
(function migrate() {
  let changed = false;
  for (const s of services) {
    const cat = CATALOG.find(c => hostOf(c.url) === hostOf(s.url));
    if (cat && !s.color) { s.color = cat.color; changed = true; }
    if (cat && cat.slug && !s.brand && !s.img && !s.glyph) { s.brand = cat.slug; changed = true; }
    if (cat && cat.glyph && !s.brand && !s.img && !s.glyph) { s.glyph = cat.glyph; changed = true; }
    if (!s.brand && s.icon && /[^\x00-\x7F]/.test(s.icon)) { s.icon = s.name.slice(0, 2); changed = true; }
  }
  if (changed) store.save(services);
})();

// Panels (service picker / right-click menu / icon changer)
//
// Service webviews are NATIVE controls layered on top of this UI webview,
// so any panel rendered here would sit *behind* e.g. the WhatsApp webview
// and look like the button does nothing. While a panel is open we ask Rust
// to hide the service webviews (hide, not destroy: sessions stay alive).
const pickerPanel = el("pickerPanel");
const ctxPanel = el("ctxPanel");
const editPanel = el("editPanel");
const adblockPanel = el("adblockPanel");
const confirmPanel = el("confirmPanel");
const managePanel = el("managePanel");
const dlPanel = el("dlPanel");
const updatePanel = el("updatePanel");
const quickPanel = el("quickPanel");
const groupPanel = el("groupPanel");
const allPanels = [pickerPanel, ctxPanel, editPanel, adblockPanel, confirmPanel, managePanel, dlPanel, updatePanel, quickPanel, groupPanel];
let ctxService = null;

let lastFocus = null;
async function openPanel(panel) {
  lastFocus = document.activeElement;
  for (const p of allPanels) p.hidden = true;
  // Only the modal popups (picker / Kelola / right-click menu,
  // class "picker") get the dimmed backdrop.
  el("scrim").hidden = !panel.classList.contains("picker");
  await invoke("set_services_visible", { visible: false });
  panel.hidden = false;
  const f = panel.querySelector("input:not([type='file']), button:not([disabled])");
  if (f) f.focus();
}

async function closePanels() {
  for (const p of allPanels) p.hidden = true;
  el("scrim").hidden = true;
  await invoke("set_services_visible", { visible: true });
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
}

// Clicking outside an open panel (welcome area, top bar) closes it.
// Sidebar clicks are excluded: they run their own open/switch logic.
document.addEventListener("click", (e) => {
  const open = allPanels.find(p => !p.hidden);
  if (!open) return;
  // Use composedPath: a handler may detach e.target mid-click.
  const path = e.composedPath ? e.composedPath() : [e.target];
  if (path.includes(open)) return;
  if (path.some(n => n && n.id === "sidebar")) return;
  closePanels();
});

// Read a user-picked icon image (.jpg/.jpeg/.png/.ico) and return a data
// URL small enough to keep in localStorage. Raster images are downscaled
// to a 96x96 square (cover-crop) as PNG; .ico files are stored as-is
// (they are already tiny icon containers, and canvas cannot reliably
// decode them) with a size cap.
function processIconFile(file) {
  return new Promise((resolve, reject) => {
    const name = (file.name || "").toLowerCase();
    const isIco = name.endsWith(".ico") || file.type.includes("icon");
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (isIco) {
        if (dataUrl.length > 700 * 1024) return reject(new Error("File .ico kegedean (maks ~500 KB)."));
        return resolve(dataUrl);
      }
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = 96; c.height = 96;
        const ctx = c.getContext("2d");
        const side = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 96, 96);
        resolve(c.toDataURL("image/png"));
      };
      img.onerror = () => reject(new Error("Gambar nggak bisa dibaca."));
      img.src = dataUrl;
    };
    reader.onerror = () => reject(new Error("File nggak bisa dibaca."));
    reader.readAsDataURL(file);
  });
}

// Sidebar
// The visual for a service without an uploaded image. Precedence:
// an explicitly chosen glyph wins over the brand logo, which wins
// over the text icon (initials). Explicit choices in the edit dialog
// clear the fields they override, so this order can never resurrect
// a logo the user replaced (the pre-v0.8.0 bug: typed text never
// showed for brand services). Uploaded images always win: render()
// handles them before calling this.
function glyphSvg(key, px, col) {
  return '<svg viewBox="0 0 24 24" width="' + px + '" height="' + px + '" fill="none" stroke="' + col + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + GLYPHS[key] + "</svg>";
}

// CSS filter for an uploaded icon image with a hue shift (0 = none).
function imgFilter(s) {
  return s && s.hue ? "hue-rotate(" + s.hue + "deg)" : "";
}

function iconVisual(s, px) {
  const col = s.iconColor || "#ffffff";
  const sp = document.createElement("span");
  if (s.glyph && GLYPHS[s.glyph]) {
    sp.className = "svgIcon";
    sp.innerHTML = glyphSvg(s.glyph, px, col);
  } else if (s.brand && ICON_PATHS[s.brand]) {
    sp.className = "svgIcon";
    sp.innerHTML = '<svg viewBox="0 0 24 24" width="' + px + '" height="' + px + '" fill="' + col + '" aria-hidden="true"><path d="' + ICON_PATHS[s.brand] + '"/></svg>';
  } else {
    sp.className = "txtIcon";
    sp.style.color = col;
    sp.textContent = s.icon || s.name.slice(0, 2);
  }
  return sp;
}

// True for the YouTube service (and any custom service on a YouTube
// host): those get the extra "Adblock YouTube" menu item / dialog
// button, and their webviews get the adblock script injected.
function isYouTubeService(s) {
  const h = hostOf(s.url);
  return h === "youtube.com" || h.endsWith(".youtube.com");
}

// The right-click menu is a panel like the others: opening it
// hides the service webviews; it shows as a centred modal.
async function openCtx(s) {
  ctxService = s;
  el("ctxTitle").textContent = s.name;
  el("ctxPin").textContent = pinned.has(s.id) ? "Unpin" : "Pin (tetap hidup buat notif)";
  el("ctxDisable").textContent = disabled.has(s.id) ? "Aktifkan lagi" : "Nonaktifkan (matikan total sementara)";
  el("ctxAdblock").hidden = !isYouTubeService(s);
  await openPanel(ctxPanel);
  el("ctxPin").focus();
}

function render() {
  document.body.classList.toggle("showNames", showNames);
  nav.innerHTML = "";
  let prevGroup = null;
  for (const s of services) {
    // Group separator: a hairline between two neighbours whose
    // groups differ (when at least one of them is grouped). The
    // divider that introduces a named group carries the group:
    // right-clicking it offers "Mulai kelompok".
    const g = groupOf(s);
    if (prevGroup !== null && g !== prevGroup && (g || prevGroup)) {
      const sep = document.createElement("div");
      sep.className = "svcSep";
      if (g) {
        sep.dataset.group = g;
        sep.title = "Kelompok " + g;
        sep.setAttribute("aria-label", sep.title);
        sep.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          openGroupPanel(g);
        });
      }
      nav.appendChild(sep);
    }
    prevGroup = g;
    const b = document.createElement("button");
    b.className = "svc" + (s.id === activeId ? " active" : "") + (disabled.has(s.id) ? " disabled" : "");
    b.title = s.name + (pinned.has(s.id) ? " (pinned - tetap hidup)" : "") + (disabled.has(s.id) ? " (nonaktif, klik untuk mengaktifkan lagi)" : "");
    b.setAttribute("aria-label", b.title);
    if (s.img) {
      const im = document.createElement("img");
      im.className = "svcImg"; im.src = s.img; im.alt = "";
      const f = imgFilter(s); if (f) im.style.filter = f;
      // A remote favicon URL can fail to load (offline, site gone):
      // fall back to the text/brand icon instead of a broken image.
      im.onerror = () => {
        im.replaceWith(iconVisual(s, svcGlyphPx()));
        if (s.color) b.style.background = s.color;
      };
      b.appendChild(im);
    } else {
      b.appendChild(iconVisual(s, svcGlyphPx()));
      if (s.color) b.style.background = s.color;
    }
    if (pinned.has(s.id)) {
      const p = document.createElement("span"); p.className = "pin"; b.appendChild(p);
    }
    if (showNames) {
      const nm = document.createElement("span");
      nm.className = "svcName";
      nm.textContent = s.name;
      b.appendChild(nm);
    }
    const n = unread.get(s.id);
    if (n && !disabled.has(s.id)) {
      const bd = document.createElement("span");
      bd.className = "badge" + (s.id === popId ? " pop" : "");
      bd.textContent = n > 99 ? "99+" : String(n);
      b.appendChild(bd);
    }
    b.addEventListener("click", async (e) => {
      if (disabled.has(s.id)) {
        // Disabled services cannot be opened; a click opens the menu
        // where "Aktifkan lagi" lives, so the way back is one click away.
        await openCtx(s);
        return;
      }
      switchTo(s);
    });
    b.addEventListener("contextmenu", async (e) => {
      e.preventDefault();
      await openCtx(s);
    });
    b.addEventListener("keydown", async (e) => {
      if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
        e.preventDefault();
        await openCtx(s);
      }
    });
    nav.appendChild(b);
  }
  popId = null;
  positionPill(false);
}

// Discord-style active indicator: a small accent pill at the left
// edge of the rail that slides to the active service icon.
const pillEl = el("activePill");
let pillShown = false;
function positionPill(instant) {
  const active = nav.querySelector(".svc.active");
  if (!active) { pillEl.hidden = true; pillShown = false; return; }
  const sb = el("sidebar").getBoundingClientRect();
  const r = active.getBoundingClientRect();
  const y = r.top - sb.top + (r.height - 24) / 2;
  pillEl.hidden = false;
  if (instant || !pillShown) {
    pillEl.style.transition = "none";
    pillEl.style.transform = "translateY(" + y + "px)";
    pillEl.getBoundingClientRect();
    pillEl.style.transition = "";
  } else {
    pillEl.style.transform = "translateY(" + y + "px)";
  }
  pillShown = true;
}
nav.addEventListener("scroll", () => positionPill(true));
window.addEventListener("resize", () => positionPill(true));

async function switchTo(s) {
  if (disabled.has(s.id)) return;
  if (linkPopupOpen) await closeLinkPopup();
  if (allPanels.some(p => !p.hidden)) await closePanels();
  activeId = s.id; render();
  localStorage.setItem("sodium.lastActive", s.id); scheduleConfigSave();
  el("activeName").textContent = s.name;
  el("welcome").style.display = "none";
  try {
    // Push this service's own zoom first: Rust stores it and applies it
    // when the webview is created (or right away if it already exists).
    await invoke("set_service_zoom", { id: s.id, scale: zoomFor(s.id) });
    await invoke("switch_service", { id: s.id, url: s.url });
    showZoom();
    const alive = await invoke("alive_services");
    el("ramNote").textContent = "";
    el("ramNote").classList.remove("error");
    console.log("Sodium alive webviews:", alive);
  } catch (err) {
    el("welcome").style.display = "";
    el("ramNote").textContent = "Gagal membuka " + s.name + ": " + err;
    el("ramNote").classList.add("error");
  }
}

// Service picker (first run + "+" button)
const grid = el("pickerGrid");
const searchInput = el("pickerSearch");

// How many instances of a catalog service already exist (the first
// add, plus numbered copies for other accounts).
function instanceCount(cat) {
  return services.filter(s =>
    (cat.slug && s.brand === cat.slug) || hostOf(s.url) === hostOf(cat.url)
  ).length;
}

// Add one instance of a catalog service. The first keeps the catalog
// id and name; further instances (another account) get the smallest
// free number: "WhatsApp 2", "WhatsApp 3", ... Each instance is its
// own service with its own empty profile folder, so logins never mix.
function addCatalogService(cat) {
  let id = cat.id;
  let name = cat.name;
  if (instanceCount(cat) > 0) {
    let n = 2;
    while (services.some(s => s.name === cat.name + " " + n)) n++;
    id = cat.id + "-" + n;
    name = cat.name + " " + n;
  }
  const svc = { id, name, url: cat.url, icon: cat.name.slice(0, 2), color: cat.color, iconColor: "#ffffff" };
  if (cat.slug) svc.brand = cat.slug;
  if (cat.glyph) svc.glyph = cat.glyph;
  services.push(svc);
  store.save(services);
  render();
  markOnboarded();
  return instanceCount(cat);
}

function renderPicker() {
  const q = searchInput.value.trim().toLowerCase();
  grid.innerHTML = "";
  for (const cat of CATALOG) {
    if (q && !cat.name.toLowerCase().includes(q)) continue;
    const t = document.createElement("button");
    t.type = "button";
    t.className = "tile";
    t.title = "Klik untuk menambah " + cat.name;
    const ic = document.createElement("span");
    ic.className = "tileIcon"; ic.style.background = cat.color;
    ic.appendChild(iconVisual({ brand: cat.slug, glyph: cat.glyph, icon: cat.name.slice(0, 2), name: cat.name, iconColor: "#ffffff" }, 28));
    const nm = document.createElement("span");
    nm.className = "tileName"; nm.textContent = cat.name;
    t.append(ic, nm);
    const badge = document.createElement("span");
    badge.className = "tileBadge";
    const n0 = instanceCount(cat);
    badge.textContent = n0 ? "\u00d7" + n0 : "";
    badge.hidden = !n0;
    t.appendChild(badge);
    // Click = add right away; there is no select-then-confirm step.
    // Only this tile's badge is updated, the grid is not re-rendered,
    // so the panel stays open and the click target stays attached.
    t.addEventListener("click", () => {
      const n = addCatalogService(cat);
      badge.textContent = "\u00d7" + n;
      badge.hidden = false;
    });
    grid.appendChild(t);
  }
  if (!grid.children.length) {
    const d = document.createElement("div");
    d.className = "pickerEmpty";
    d.textContent = "Tidak ada layanan yang cocok dengan \"" + searchInput.value.trim() + "\". Coba kata lain, atau tambah lewat form custom URL di bawah.";
    grid.appendChild(d);
  }
}

function markOnboarded() { localStorage.setItem("sodium.onboarded", "1"); scheduleConfigSave(); }

async function openPicker() {
  searchInput.value = "";
  el("pickerSkip").textContent = localStorage.getItem("sodium.onboarded") ? "Tutup" : "Lewati";
  renderPicker();
  await openPanel(pickerPanel);
  searchInput.focus();
}

// Right-click menu actions: pin, disable, and the door to the
// Kelola panel.
el("ctxPin").addEventListener("click", async () => {
  if (!ctxService) return;
  togglePin(ctxService);
  await closePanels();
});
el("ctxDisable").addEventListener("click", async () => {
  if (!ctxService) return;
  await setServiceDisabled(ctxService, !disabled.has(ctxService.id));
  await closePanels();
});
el("ctxManage").addEventListener("click", async () => {
  await openManage();
});
el("ctxAdblock").addEventListener("click", async () => {
  await openAdblockPanel(null);
});

el("addBtn").addEventListener("click", openPicker);
searchInput.addEventListener("input", renderPicker);
el("pickerSkip").addEventListener("click", async () => { markOnboarded(); await closePanels(); });

// Custom-service icon choice: a glyph from the generic set, or an
// uploaded image; with neither, the service starts with its name's
// initials and (as before) a best-effort favicon fetch after adding.
let customImg = null;
let customGlyph = null;
function clearCustomImg() {
  customImg = null;
  el("cIconPreview").hidden = true;
  el("cIconPreview").removeAttribute("src");
}
function paintCustomGlyphs() {
  const box = el("customGlyphs");
  box.innerHTML = "";
  for (const key of Object.keys(GLYPHS)) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "glyphBtn" + (key === customGlyph ? " sel" : "");
    b.title = GLYPH_LABELS[key] || key;
    b.setAttribute("aria-label", b.title);
    b.innerHTML = glyphSvg(key, 20, "currentColor");
    b.addEventListener("click", () => {
      customGlyph = customGlyph === key ? null : key;
      if (customGlyph) clearCustomImg();
      paintCustomGlyphs();
    });
    box.appendChild(b);
  }
}
paintCustomGlyphs();
el("cUploadBtn").addEventListener("click", () => el("cIconFile").click());
el("cIconPreview").addEventListener("click", clearCustomImg);
el("cIconFile").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  try {
    customImg = await processIconFile(f);
    customGlyph = null;
    paintCustomGlyphs();
    el("cIconPreview").src = customImg;
    el("cIconPreview").hidden = false;
  } catch { /* unreadable file: keep the glyph / initials icon */ }
});
el("customAdd").addEventListener("click", async () => {
  const name = el("cName").value.trim();
  let url = el("cUrl").value.trim();
  if (!name || !url) return;
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now().toString(36);
  const svc = { id, name, url, icon: name.slice(0, 2) };
  if (customGlyph) svc.glyph = customGlyph;
  if (customImg) svc.img = customImg;
  services.push(svc);
  if (!customImg) fetchFaviconFor(svc);
  store.save(services); render();
  el("cName").value = ""; el("cUrl").value = "";
  customGlyph = null;
  paintCustomGlyphs();
  clearCustomImg();
  markOnboarded();
  await closePanels();
});

// Favicons for custom services, best effort in order: Google,
// DuckDuckGo, the site's own /favicon.ico. CORS-readable results
// are stored as data URLs (work offline); runs once, kept in svc.img.
function faviconSources(host) {
  return [
    "https://www.google.com/s2/favicons?domain=" + host + "&sz=128",
    "https://icons.duckduckgo.com/ip3/" + host + ".ico",
    "https://" + host + "/favicon.ico",
  ];
}
function faviconAsDataUrl(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const to = setTimeout(() => resolve(null), 6000);
    img.onload = () => {
      clearTimeout(to);
      try {
        const w = Math.min(64, img.naturalWidth || 64);
        const h = Math.min(64, img.naturalHeight || 64);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL("image/png"));
      } catch { resolve(null); }
    };
    img.onerror = () => { clearTimeout(to); resolve(null); };
    img.src = url;
  });
}
async function fetchFaviconFor(s) {
  if (s.img || s.brand) return;
  const host = hostOf(s.url);
  if (!host) return;
  for (const u of faviconSources(host)) {
    const d = await faviconAsDataUrl(u);
    if (d) { s.img = d; s.favicon = true; store.save(services); render(); return; }
  }
  s.img = faviconSources(host)[0];
  s.favicon = true;
  store.save(services); render();
}

// Service actions, shared by the right-click menu (quick actions) and
// the Kelola layanan panel (full management, v0.4.0).
function togglePin(s) {
  const nowPinned = !pinned.has(s.id);
  if (nowPinned) pinned.add(s.id); else pinned.delete(s.id);
  store.savePinned(pinned);
  invoke("set_pinned", { id: s.id, pinned: nowPinned });
  render();
}

// Disable = destroy the webview completely (RAM freed, nothing runs),
// but keep the profile folder: cookies/session survive on disk, so
// re-enabling never asks for a new login.
async function setServiceDisabled(s, off) {
  const id = s.id;
  if (!off) {
    disabled.delete(id);
  } else {
    disabled.add(id);
    await invoke("close_service", { id });
    if (activeId === id) {
      activeId = null;
      if (localStorage.getItem("sodium.lastActive") === id) localStorage.removeItem("sodium.lastActive"); scheduleConfigSave();
      el("activeName").textContent = "Sodium";
      el("welcome").style.display = "";
      showZoom();
    }
  }
  store.saveDisabled(disabled);
  render();
}

// Duplicate with a fresh, empty profile: same URL, icon and colours,
// next free number in the name ("WhatsApp 2", "WhatsApp 3", ...). No
// session or cookie is copied, so the copy is a clean sign-in for a
// different account. Pin and disabled state are per-service and are
// not inherited: the new id is in neither set.
function duplicateService(srcSvc) {
  const base = srcSvc.name.replace(/\s+\d+$/, "");
  let n = 2;
  while (services.some(s => s.name === base + " " + n)) n++;
  const copy = { ...srcSvc, id: srcSvc.id + "-d" + Date.now().toString(36), name: base + " " + n };
  services.push(copy);
  store.save(services);
  render();
  return copy;
}

// Delete removes the service from the list; its profile folder stays
// on disk either way, so re-adding it later restores the login.
async function deleteService(id) {
  services = services.filter(x => x.id !== id);
  store.save(services);
  if (pinned.has(id)) { pinned.delete(id); store.savePinned(pinned); invoke("set_pinned", { id, pinned: false }); }
  if (disabled.has(id)) { disabled.delete(id); store.saveDisabled(disabled); }
  if (activeId === id) {
    activeId = null;
    el("activeName").textContent = "Sodium";
    el("welcome").style.display = "";
  }
  if (localStorage.getItem("sodium.lastActive") === id) localStorage.removeItem("sodium.lastActive"); scheduleConfigSave();
  await invoke("close_service", { id });
  render();
}

// ------------------------------------------------------------------
// Edit dialog (v0.8.0): one centred dialog per service, in the spirit
// of Firefox/Zen container settings — name, URL, group, the icon
// editor, tile/logo colours, pin & disable switches, duplicate.
// The old standalone icon panel is gone: icon editing lives here.
//
// The icon editor works on a draft (mode + glyph + text + image +
// hue + colours) with a live preview; nothing lands until Simpan.
// Modes: "brand" (catalog logo), "glyph" (generic SVG), "text"
// (1-2 initials), "image" (uploaded image / favicon, with a hue
// slider). Saving a non-brand mode clears the fields it overrides,
// so an explicit user choice always wins over the brand logo.
const COLOR_SWATCHES = ["#ffffff", "#e8eaf0", "#9aa3b5", "#14161a", "#f5c518", "#1faa55", "#229ed9", "#1877f2", "#5865f2", "#c13584", "#e60023", "#ee4d2d", "#ff4500", "#42b549", "#611f69", "#b20710"];
let editId = null;
let editDraft = null;

function catalogFor(s) {
  return CATALOG.find(c => hostOf(c.url) === hostOf(s.url)) || null;
}

function refreshGroupDatalist() {
  const dl = el("groupNames");
  dl.innerHTML = "";
  for (const g of [...new Set(services.map(groupOf).filter(Boolean))].sort()) {
    const o = document.createElement("option");
    o.value = g;
    dl.appendChild(o);
  }
}

async function openEditDialog(s) {
  editId = s.id;
  editDraft = {
    mode: s.img ? "image" : (s.glyph ? "glyph" : (s.brand ? "brand" : "text")),
    glyph: s.glyph || "bag",
    text: (s.icon && !/[^\x00-\x7F]/.test(s.icon)) ? s.icon : s.name.slice(0, 2),
    img: s.img || null,
    favicon: !!s.favicon,
    hue: s.hue || 0,
    color: s.color || "#262a33",
    iconColor: s.iconColor || "#ffffff",
  };
  el("editName").value = s.name;
  el("editUrl").value = s.url;
  el("editGroup").value = s.group || "";
  el("editPin").checked = pinned.has(s.id);
  el("editDisabled").checked = disabled.has(s.id);
  el("editIconMsg").textContent = "";
  el("editAdblockBtn").hidden = !isYouTubeService(s);
  refreshGroupDatalist();
  paintEditWarn();
  paintEditIcon();
  await openPanel(editPanel);
}

function paintEditWarn() {
  const s = services.find(x => x.id === editId);
  const warn = el("editWarn");
  if (!s) { warn.hidden = true; return; }
  const oldHost = hostOf(s.url);
  const nh = hostOf(el("editUrl").value.trim());
  warn.hidden = !(nh && oldHost && nh !== oldHost);
  if (!warn.hidden) {
    warn.textContent = "Host berubah (" + oldHost + " → " + nh + "): webview layanan ditutup dan dibuka ulang pakai alamat baru. Sesi login lama tetap tersimpan di profil layanan ini.";
  }
}
el("editUrl").addEventListener("input", paintEditWarn);
el("editName").addEventListener("input", paintEditIcon);
el("editIconText").addEventListener("input", () => {
  if (!editDraft) return;
  editDraft.text = el("editIconText").value;
  paintEditPreview();
});

function paintSwatches(container, key) {
  container.innerHTML = "";
  for (const c of COLOR_SWATCHES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "swatch" + (editDraft[key].toLowerCase() === c ? " sel" : "");
    b.style.background = c;
    b.title = c;
    b.setAttribute("aria-label", "Warna " + c);
    b.addEventListener("click", () => { editDraft[key] = c; paintEditIcon(); });
    container.appendChild(b);
  }
}

function paintGlyphGrid(container, selected, onPick) {
  container.innerHTML = "";
  for (const key of Object.keys(GLYPHS)) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "glyphBtn" + (key === selected ? " sel" : "");
    b.title = GLYPH_LABELS[key] || key;
    b.setAttribute("aria-label", b.title);
    b.innerHTML = glyphSvg(key, 20, "currentColor");
    b.addEventListener("click", () => onPick(key));
    container.appendChild(b);
  }
}

// The service object the draft would produce, for the live preview.
function draftVisual() {
  const s = services.find(x => x.id === editId);
  const cat = s ? catalogFor(s) : null;
  return {
    brand: editDraft.mode === "brand" ? ((s && s.brand) || (cat && cat.slug) || null) : null,
    glyph: editDraft.mode === "glyph" ? editDraft.glyph : null,
    icon: editDraft.text || ((s && s.name) || "?").slice(0, 2),
    name: (s && s.name) || "",
    iconColor: editDraft.iconColor,
  };
}

function paintEditPreview() {
  if (!editDraft) return;
  const pv = el("editPreview");
  pv.innerHTML = "";
  pv.style.background = editDraft.color;
  if (editDraft.mode === "image" && editDraft.img) {
    const im = document.createElement("img");
    im.className = "svcImg"; im.src = editDraft.img; im.alt = "";
    const f = imgFilter(editDraft); if (f) im.style.filter = f;
    pv.appendChild(im);
  } else {
    pv.appendChild(iconVisual(draftVisual(), 28));
  }
}

function paintEditIcon() {
  const s = services.find(x => x.id === editId);
  if (!s || !editDraft) return;
  const cat = catalogFor(s);
  el("modeBrand").hidden = !(s.brand || (cat && cat.slug));
  el("modeImage").hidden = !editDraft.img;
  for (const b of el("editModes").querySelectorAll("button")) {
    b.classList.toggle("sel", b.dataset.mode === editDraft.mode);
  }
  el("glyphGrid").hidden = editDraft.mode !== "glyph";
  if (editDraft.mode === "glyph") {
    paintGlyphGrid(el("glyphGrid"), editDraft.glyph, (k) => { editDraft.glyph = k; paintEditIcon(); });
  }
  el("editIconText").hidden = editDraft.mode !== "text";
  if (document.activeElement !== el("editIconText")) el("editIconText").value = editDraft.text;
  const hasImg = !!editDraft.img;
  const imgActive = hasImg && editDraft.mode === "image";
  el("editImgPreview").hidden = !hasImg;
  if (hasImg) {
    el("editImgPreview").src = editDraft.img;
    el("editImgPreview").style.filter = imgActive ? imgFilter(editDraft) : "";
  }
  el("editRemoveImg").hidden = !hasImg;
  el("hueRow").hidden = !imgActive;
  if (imgActive) {
    el("hueRange").value = String(editDraft.hue);
    el("hueVal").textContent = String(editDraft.hue);
  }
  // An uploaded image covers the whole tile, so a logo colour
  // cannot apply to it: that row is hidden while an image is used.
  el("editLogoColorRow").hidden = imgActive;
  paintSwatches(el("editTilePalette"), "color");
  paintSwatches(el("editLogoPalette"), "iconColor");
  paintEditPreview();
}

for (const b of el("editModes").querySelectorAll("button")) {
  b.addEventListener("click", () => {
    if (!editDraft) return;
    editDraft.mode = b.dataset.mode;
    paintEditIcon();
  });
}
el("editUploadBtn").addEventListener("click", () => el("editIconFile").click());
el("editIconFile").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f || !editDraft) return;
  try {
    // Draft only: the image lands when Simpan is clicked.
    editDraft.img = await processIconFile(f);
    editDraft.favicon = false;
    editDraft.mode = "image";
    el("editIconMsg").textContent = "";
    paintEditIcon();
  } catch (err) {
    el("editIconMsg").textContent = String(err && err.message || err);
  }
});
el("editRemoveImg").addEventListener("click", () => {
  if (!editDraft) return;
  editDraft.img = null;
  editDraft.favicon = false;
  editDraft.hue = 0;
  if (editDraft.mode === "image") {
    const s = services.find(x => x.id === editId);
    const cat = s ? catalogFor(s) : null;
    editDraft.mode = (s && s.brand) || (cat && cat.slug) ? "brand" : "glyph";
  }
  paintEditIcon();
});
el("hueRange").addEventListener("input", () => {
  if (!editDraft) return;
  editDraft.hue = Number(el("hueRange").value) || 0;
  el("hueVal").textContent = String(editDraft.hue);
  paintEditPreview();
  if (editDraft.img) el("editImgPreview").style.filter = imgFilter(editDraft);
});
el("hueReset").addEventListener("click", () => {
  if (!editDraft) return;
  editDraft.hue = 0;
  paintEditIcon();
});
el("editAdblockBtn").addEventListener("click", async () => {
  if (editId) await openAdblockPanel(editId);
});
el("editDuplicate").addEventListener("click", async () => {
  const s = services.find(x => x.id === editId);
  if (!s) return;
  editId = null; editDraft = null;
  duplicateService(s);
  await openManage();
});
el("editCancel").addEventListener("click", async () => {
  editId = null; editDraft = null;
  await openManage();
});
el("editSave").addEventListener("click", async () => {
  const s = services.find(x => x.id === editId);
  if (!s || !editDraft) return;
  const name = el("editName").value.trim();
  let url = el("editUrl").value.trim();
  if (!name || !url) return;
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  const urlChanged = url !== s.url;
  const wasDisabled = disabled.has(s.id);
  const wantDisabled = el("editDisabled").checked;
  const wantPin = el("editPin").checked;

  s.name = name;
  const grp = el("editGroup").value.trim();
  if (grp) s.group = grp; else delete s.group;

  // Icon draft: the chosen mode clears whatever it overrides, so
  // the explicit choice always wins over the brand logo.
  const cat = catalogFor(s);
  if (editDraft.mode === "image" && editDraft.img) {
    s.img = editDraft.img;
    if (editDraft.favicon) s.favicon = true; else delete s.favicon;
    delete s.glyph;
    if (editDraft.hue) s.hue = editDraft.hue; else delete s.hue;
  } else if (editDraft.mode === "glyph") {
    s.glyph = editDraft.glyph;
    delete s.img; delete s.favicon; delete s.brand; delete s.hue;
  } else if (editDraft.mode === "text") {
    s.icon = editDraft.text.trim() || name.slice(0, 2);
    delete s.glyph; delete s.img; delete s.favicon; delete s.brand; delete s.hue;
  } else {
    const slug = s.brand || (cat && cat.slug);
    if (slug) s.brand = slug;
    delete s.glyph; delete s.img; delete s.favicon; delete s.hue;
  }
  s.color = editDraft.color;
  s.iconColor = editDraft.iconColor;
  if (activeId === s.id) el("activeName").textContent = name;
  editId = null; editDraft = null;
  store.save(services);
  if (wantPin !== pinned.has(s.id)) togglePin(s);
  render();

  if (urlChanged) {
    s.url = url;
    store.save(services);
    await invoke("close_service", { id: s.id });
    if (!s.brand && s.favicon) {
      delete s.img;
      delete s.favicon;
      store.save(services);
      fetchFaviconFor(s);
    }
    render();
    if (activeId === s.id && !wantDisabled) await switchTo(s);
  }
  if (wantDisabled !== wasDisabled) await setServiceDisabled(s, wantDisabled);
  render();
  await openManage();
});

// ------------------------------------------------------------------
// Small confirm dialog (used for service deletion from the Kelola
// list): a real modal, not a two-click arm.
let confirmAction = null;
let confirmFromManage = false;
function openConfirm({ title, body, okLabel, onOk, fromManage }) {
  el("confirmTitle").textContent = title;
  el("confirmBody").textContent = body;
  el("confirmOk").textContent = okLabel || "Hapus";
  confirmAction = onOk || null;
  confirmFromManage = !!fromManage;
  openPanel(confirmPanel);
}
el("confirmCancel").addEventListener("click", async () => {
  confirmAction = null;
  if (confirmFromManage) { confirmFromManage = false; await openManage(); }
  else await closePanels();
});
el("confirmOk").addEventListener("click", async () => {
  const f = confirmAction;
  const back = confirmFromManage;
  confirmAction = null; confirmFromManage = false;
  await closePanels();
  if (f) await f();
  if (back) await openManage();
});

// Kelola layanan panel (v0.8.0, Container-style like Firefox/Zen):
// a plain list — drag grip, icon, name, status pills, edit (pencil)
// and delete (trash, behind a confirm dialog) — plus the global
// sidebar settings. All per-service editing happens in the edit
// dialog (see openEditDialog above).
const manageList = el("manageList");

async function openManage() {
  renderManage();
  await openPanel(managePanel);
}
el("manageBtn").addEventListener("click", openManage);
el("manageClose").addEventListener("click", closePanels);
el("manageAdd").addEventListener("click", openPicker);
el("showNamesToggle").addEventListener("change", () => {
  showNames = el("showNamesToggle").checked;
  localStorage.setItem("sodium.showNames", showNames ? "1" : "0"); scheduleConfigSave();
  render();
});
el("iconSizeSel").addEventListener("change", () => {
  iconSize = Number(el("iconSizeSel").value) || 48;
  localStorage.setItem("sodium.iconSize", String(iconSize)); scheduleConfigSave();
  applyIconSize();
  render();
});

const MG_ICONS = {
  edit: '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
};
function mgIconButton(icon, cls, title, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "mgAct " + cls;
  b.title = title;
  b.setAttribute("aria-label", title);
  b.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + MG_ICONS[icon] + "</svg>";
  b.addEventListener("click", onClick);
  return b;
}

// Pointer-based drag reorder for the Kelola list. HTML5 drag &
// drop never actually starts inside Sodium's WebView2 windows, so
// the grip tracks pointer events directly instead: the dragged
// row follows the cursor via a transform while the other rows
// stay put in the layout.
let mgDrag = null; // { from, startY, startScroll, insertBefore, row }

function clearDragMarks() {
  for (const r of manageList.querySelectorAll(".mgRow")) r.classList.remove("dropAbove", "dropBelow");
}

// Where would the dragged row land if dropped at this pointer Y?
// Returns the original services index to insert before
// (services.length = past the end) and the row to mark.
function mgInsertPoint(clientY) {
  let lastOther = null;
  for (const r of manageList.querySelectorAll(".mgRow")) {
    if (mgDrag && r === mgDrag.row) continue;
    lastOther = r;
    const rect = r.getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) {
      return { before: Number(r.dataset.idx), mark: r, below: false };
    }
  }
  return { before: services.length, mark: lastOther, below: true };
}

function renderManage() {
  el("showNamesToggle").checked = showNames;
  el("iconSizeSel").value = String(iconSize);
  refreshGroupDatalist();
  manageList.innerHTML = "";
  services.forEach((s, idx) => {
    const row = document.createElement("div");
    row.className = "mgRow" + (disabled.has(s.id) ? " off" : "");
    row.dataset.idx = String(idx);
    // Pointer drag reorder: only the grip starts a drag, so text
    // selection and button clicks elsewhere on the row stay normal.
    const grip = document.createElement("span");
    grip.className = "mgGrip";
    grip.title = "Seret untuk mengubah urutan";
    grip.setAttribute("aria-label", grip.title);
    grip.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></svg>';
    grip.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || mgDrag) return;
      e.preventDefault();
      mgDrag = {
        from: idx,
        startY: e.clientY,
        startScroll: manageList.scrollTop,
        insertBefore: idx,
        row,
      };
      row.classList.add("dragging");
      manageList.classList.add("dragging");
      try { grip.setPointerCapture(e.pointerId); } catch { /* older WebView2 */ }
      const onMove = (ev) => {
        if (!mgDrag) return;
        // Auto-scroll when the pointer nears the list's edges,
        // then follow the pointer (the scroll delta is part of the
        // offset so the row stays glued to the cursor).
        const lr = manageList.getBoundingClientRect();
        if (ev.clientY < lr.top + 40) manageList.scrollTop -= 10;
        else if (ev.clientY > lr.bottom - 40) manageList.scrollTop += 10;
        const dy = (ev.clientY - mgDrag.startY) + (manageList.scrollTop - mgDrag.startScroll);
        row.style.transform = "translateY(" + dy + "px)";
        const p = mgInsertPoint(ev.clientY);
        mgDrag.insertBefore = p.before;
        clearDragMarks();
        if (p.mark) p.mark.classList.add(p.below ? "dropBelow" : "dropAbove");
      };
      const onUp = () => {
        grip.removeEventListener("pointermove", onMove);
        grip.removeEventListener("pointerup", onUp);
        grip.removeEventListener("pointercancel", onUp);
        if (!mgDrag) return;
        const from = mgDrag.from;
        let to = mgDrag.insertBefore;
        mgDrag = null;
        if (to > from) to -= 1;
        if (to !== from && to >= 0 && to < services.length) {
          const [it] = services.splice(from, 1);
          services.splice(to, 0, it);
          store.save(services);
          render();
        }
        renderManage();
      };
      grip.addEventListener("pointermove", onMove);
      grip.addEventListener("pointerup", onUp);
      grip.addEventListener("pointercancel", onUp);
    });
    const ic = document.createElement("span");
    ic.className = "tileIcon mgIcon";
    if (s.img) {
      const im = document.createElement("img");
      im.className = "svcImg"; im.src = s.img; im.alt = "";
      const f = imgFilter(s); if (f) im.style.filter = f;
      im.onerror = () => { im.replaceWith(iconVisual(s, 24)); if (s.color) ic.style.background = s.color; };
      ic.appendChild(im);
    } else {
      if (s.color) ic.style.background = s.color;
      ic.appendChild(iconVisual(s, 24));
    }
    const info = document.createElement("div");
    info.className = "mgInfo";
    const nm = document.createElement("div");
    nm.className = "mgName"; nm.textContent = s.name;
    const sub = document.createElement("div");
    sub.className = "mgSub"; sub.textContent = s.url; sub.title = s.url;
    info.append(nm, sub);
    const slot = document.createElement("div");
    slot.className = "mgStatusSlot";
    if (pinned.has(s.id)) {
      const p = document.createElement("span");
      p.className = "mgPill pin"; p.textContent = "Dipin";
      slot.appendChild(p);
    }
    if (disabled.has(s.id)) {
      const p = document.createElement("span");
      p.className = "mgPill"; p.textContent = "Nonaktif";
      slot.appendChild(p);
    }
    const acts = document.createElement("div");
    acts.className = "mgActs";
    acts.append(
      mgIconButton("edit", "", "Edit layanan", () => openEditDialog(s)),
      mgIconButton("trash", "danger", "Hapus layanan", () => askDeleteService(s)),
    );
    row.append(grip, ic, info, slot, acts);
    manageList.appendChild(row);
  });
}

function askDeleteService(s) {
  openConfirm({
    title: "Hapus layanan",
    body: "Hapus \"" + s.name + "\" dari Sodium? Webview-nya akan ditutup dan layanan hilang dari daftar.",
    okLabel: "Hapus",
    fromManage: true,
    onOk: async () => { await deleteService(s.id); renderManage(); },
  });
}

// Link popup
//
// Links inside a service that ask for a new window (target=_blank,
// window.open) are denied by Rust and reported here as a "link-clicked"
// event instead. The UI shows the link bar and asks Rust to open the
// popup webview floating over the active service.
const linkBar = el("linkBar");
let linkPopupOpen = false;
let currentLink = "";
window.__TAURI__.event.listen("link-clicked", async (e) => {
  const url = String(e.payload || "");
  if (!url) return;
  currentLink = url;
  el("linkUrlText").textContent = url;
  el("linkUrlText").title = url;
  el("linkCopy").textContent = "Salin link";
  linkBar.hidden = false;
  linkPopupOpen = true;
  try { await invoke("open_link_popup", { url }); }
  catch { /* popup failed to open; the bar still offers copy / external */ }
});
async function closeLinkPopup() {
  if (!linkPopupOpen) return;
  linkPopupOpen = false;
  linkBar.hidden = true;
  await invoke("close_link_popup");
}
el("linkClose").addEventListener("click", closeLinkPopup);
el("linkExternal").addEventListener("click", async () => {
  if (currentLink) { try { await invoke("open_external", { url: currentLink }); } catch { /* ignore */ } }
  closeLinkPopup();
});
el("linkCopy").addEventListener("click", async () => {
  if (!currentLink) return;
  try { await navigator.clipboard.writeText(currentLink); }
  catch {
    const ta = document.createElement("textarea");
    ta.value = currentLink;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  el("linkCopy").textContent = "Tersalin ✓";
  setTimeout(() => { el("linkCopy").textContent = "Salin link"; }, 1500);
});

// Downloads: Rust reports starts and finishes. Starts drive the
// top-bar pill; finishes feed the toast and the history panel
// (kept in localStorage, newest first, capped at 50).
let toastTimer = null;
function showToast(text, title) {
  const toast = el("toast");
  toast.textContent = text;
  toast.title = title || text;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4500);
}

let downloads = [];
try { downloads = JSON.parse(localStorage.getItem("sodium.downloads") || "[]"); } catch { downloads = []; }
let activeDownloads = 0;
let installerPath = ""; // set when an update installer finishes downloading

function saveDownloads() {
  localStorage.setItem("sodium.downloads", JSON.stringify(downloads.slice(0, 50)));
  scheduleConfigSave();
}

function sourceName(sourceId) {
  if (sourceId === "link-popup") return "Popup link";
  if (sourceId === "sodium-update") return "Update Sodium";
  const s = services.find(x => x.id === sourceId);
  return s ? s.name : sourceId;
}

window.__TAURI__.event.listen("download-started", (e) => {
  activeDownloads += 1;
  const pill = el("dlPill");
  pill.textContent = "Mengunduh: " + String(e.payload || "file") + "…";
  pill.hidden = false;
});

window.__TAURI__.event.listen("download-finished", (e) => {
  const [path, sourceId, success] = e.payload || [];
  activeDownloads = Math.max(0, activeDownloads - 1);
  if (activeDownloads === 0) el("dlPill").hidden = true;
  if (success && path) {
    const name = String(path).split(/[\\/]/).pop();
    downloads.unshift({ name, path: String(path), source: sourceId || "", time: Date.now() });
    saveDownloads();
    if (sourceId === "sodium-update") { installerPath = String(path); refreshUpdateButtons(); }
    showToast("Tersimpan: " + path, path);
    if (!dlPanel.hidden) renderDownloads();
  } else if (!success) {
    showToast("Unduhan gagal atau dibatalkan.");
  }
});

function renderDownloads() {
  const list = el("dlList");
  list.innerHTML = "";
  if (!downloads.length) {
    const d = document.createElement("div");
    d.className = "dlEmpty";
    d.textContent = "Belum ada unduhan.";
    list.appendChild(d);
    return;
  }
  for (const d of downloads) {
    const row = document.createElement("div");
    row.className = "dlRow";
    const info = document.createElement("div");
    info.className = "dlInfo";
    const name = document.createElement("div");
    name.className = "dlName";
    name.textContent = d.name;
    name.title = d.path;
    const meta = document.createElement("div");
    meta.className = "dlMeta";
    meta.textContent = sourceName(d.source) + " · " + new Date(d.time).toLocaleString("id-ID");
    info.append(name, meta);
    const btn = document.createElement("button");
    btn.className = "btnGhost";
    btn.textContent = "Buka folder";
    btn.addEventListener("click", () => invoke("reveal_file", { path: d.path }).catch(() => {}));
    row.append(info, btn);
    list.appendChild(row);
  }
}

el("dlBtn").addEventListener("click", () => { renderDownloads(); openPanel(dlPanel); });
el("dlClose").addEventListener("click", closePanels);
el("reloadBtn").addEventListener("click", () => { invoke("reload_service").catch(() => {}); });

// Update check against the public GitHub repo: the latest release
// is compared with the running version. The installer downloads
// inside Sodium (the UI webview has the same download handler as
// the service webviews); once it lands, the panel offers to run it.
let appVer = "";
let updateAssetUrl = "";
let pendingLatest = "";
function refreshUpdateButtons() {
  const ready = !!installerPath;
  el("updateInstall").hidden = !ready;
  el("updateDownload").hidden = ready;
}
// Persistent dot on the top-bar update button while a newer
// version is known to exist: it survives the panel being closed
// and only clears once Sodium is up to date again.
function refreshUpdateDot() {
  el("updateDot").hidden = !pendingLatest;
}
function versionNewer(latest, current) {
  // Prerelease suffixes ("0.9.0-beta.1") are stripped before the
  // numeric compare: the beta's own tag must read as its base
  // version, while a higher base (0.9.1-beta.x) still counts.
  const a = String(latest).split("-")[0].split(".").map(n => parseInt(n, 10) || 0);
  const b = String(current).split("-")[0].split(".").map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

async function checkUpdate(manual) {
  try {
    const res = await fetch("https://api.github.com/repos/aindranto/Sodium-Beta/releases/latest", {
      headers: { "Accept": "application/vnd.github+json" },
    });
    if (!res.ok) throw new Error("http " + res.status);
    const rel = await res.json();
    // The fetch succeeded: only now is the check schedule consumed.
    // A failed check (offline at startup, say) must not burn the
    // day's slot the way the pre-v0.8.0 code did.
    localStorage.setItem("sodium.lastUpdateCheck", new Date().toDateString()); scheduleConfigSave();
    const latest = String(rel.tag_name || "").replace(/^v/, "");
    if (!latest || !appVer) throw new Error("no version");
    if (!versionNewer(latest, appVer)) {
      pendingLatest = "";
      refreshUpdateDot();
      if (manual) showToast("Sodium Beta sudah versi terbaru (v" + appVer + ").");
      return;
    }
    const asset = (rel.assets || []).find(a => /setup\.exe$/i.test(a.name)) || (rel.assets || [])[0];
    updateAssetUrl = asset ? asset.browser_download_url : rel.html_url;
    pendingLatest = latest;
    // An installer for this exact version may already sit in the
    // download history (e.g. downloaded in a previous session).
    if (!installerPath) {
      const d = downloads.find(x => x.source === "sodium-update" && x.name.includes(latest));
      if (d) installerPath = d.path;
    }
    refreshUpdateButtons();
    refreshUpdateDot();
    el("updateTitle").textContent = "Sodium Beta v" + latest + " tersedia";
    el("updateBody").textContent = (rel.body || "").trim() || "Catatan rilis tidak tersedia.";
    // Automatic checks only light the dot; the panel opens from the
    // button (or a manual check), never by popping up on its own.
    if (manual) openPanel(updatePanel);
  } catch {
    if (manual) showToast("Gagal memeriksa update — periksa koneksi internet.");
  }
}

// Automatic checks: once shortly after startup, then every 6 hours
// while Sodium keeps running — a release dropped mid-day is noticed
// without waiting for a restart or the next day.
function scheduleAutoUpdateChecks() {
  setTimeout(() => checkUpdate(false), 5000);
  setInterval(() => checkUpdate(false), 6 * 60 * 60 * 1000);
}

el("updateBtn").addEventListener("click", () => {
  if (pendingLatest) { openPanel(updatePanel); return; }
  checkUpdate(true);
});
el("updateLater").addEventListener("click", closePanels);
el("updateBrowser").addEventListener("click", () => {
  if (updateAssetUrl) invoke("open_external", { url: updateAssetUrl }).catch(() => {});
  closePanels();
});
el("updateDownload").addEventListener("click", () => {
  if (!updateAssetUrl) return;
  // Anchor navigation to the asset: GitHub serves it as an
  // attachment, so the UI webview's download handler takes over
  // (Save As dialog, progress pill, history) instead of navigating.
  const a = document.createElement("a");
  a.href = updateAssetUrl;
  document.body.appendChild(a);
  a.click();
  a.remove();
  closePanels();
});
el("updateInstall").addEventListener("click", async () => {
  if (!installerPath) return;
  try {
    await invoke("run_installer", { path: installerPath });
  } catch {
    showToast("Gagal menjalankan installer — buka dari riwayat unduhan.");
  }
});

// AI panel (Sodium Beta experiment): a NATIVE Gemini chat drawn
// by this UI in a fixed right-hand column — no AI webview at all.
// Rust only reserves the layout space (ai_set_open shrinks the
// service area while the panel is open) and extracts the active
// service's visible text (ai_extract_context) for the optional
// screen-context attachment. Replies come straight from the
// Gemini API with the user's own AI Studio key (free tier);
// history lives in memory for this session only, on purpose.
let aiOpen = false;
let aiTurns = [];   // { role: "user" | "model", text } — payload texts
let aiCtx = null;   // { title, url, text } while screen context is attached
let aiBusy = false;

const aiPanel = el("aiPanel");
const aiMsgs = el("aiMsgs");
const aiInput = el("aiInput");
const aiSendBtn = el("aiSendBtn");

function geminiKey() { return (localStorage.getItem("sodium.geminiKey") || "").trim(); }
function geminiModel() { return localStorage.getItem("sodium.geminiModel") || "gemini-2.5-flash"; }

function aiScrollBottom() { aiMsgs.scrollTop = aiMsgs.scrollHeight; }

// Messages are rendered with textContent only — API replies are
// never trusted as HTML.
function aiAddMsg(role, text) {
  const d = document.createElement("div");
  d.className = "aiMsg " + role;
  d.textContent = text;
  aiMsgs.appendChild(d);
  aiScrollBottom();
  return d;
}

function paintAiBusy() {
  const ready = !!geminiKey();
  aiSendBtn.disabled = aiBusy || !ready;
  aiInput.disabled = aiBusy || !ready;
}

// Without an API key the chat cannot work: the setup guide shows
// in the panel and the input row stays disabled.
function paintAiSetup() {
  el("aiSetup").hidden = !!geminiKey();
  paintAiBusy();
}

async function openAiPanel() {
  aiPanel.hidden = false;
  aiOpen = true;
  paintAiSetup();
  try { await invoke("ai_set_open", { open: true }); } catch { /* relayout is best-effort */ }
  // One-time beta warning, the first time the panel is opened.
  if (!localStorage.getItem("sodium.aiBetaSeen")) {
    localStorage.setItem("sodium.aiBetaSeen", "1");
    showToast("Panel AI native Gemini masih BETA — fitur uji coba. Panel ini memakai kunci API Gemini (AI Studio, gratis); atur lewat ikon pengaturan di panel.");
  }
  if (geminiKey()) aiInput.focus();
}

async function closeAiPanel() {
  aiPanel.hidden = true;
  aiOpen = false;
  try { await invoke("ai_set_open", { open: false }); } catch { /* panel already closed */ }
}

el("aiBtn").addEventListener("click", () => { aiOpen ? closeAiPanel() : openAiPanel(); });
el("aiCloseBtn").addEventListener("click", closeAiPanel);

el("aiNewBtn").addEventListener("click", () => {
  aiTurns = [];
  aiMsgs.innerHTML = "";
  detachAiCtx();
  paintAiSetup();
  aiInput.focus();
});

// --- Screen context attachment -------------------------------------
// Rust's ai_extract_context returns one assembled string:
// "[Konteks layar Sodium — layanan: <title>, alamat: <url>]\n<text>".
// Split it back apart so the chip can name the source and the send
// path can rebuild the payload in its own format.
function parseAiContext(raw) {
  const m = /^\[Konteks layar Sodium — layanan: (.*), alamat: ([^\]]*)\]\n([\s\S]*)$/.exec(raw || "");
  if (!m) return { title: "Layanan aktif", url: "", text: String(raw || "") };
  return { title: m[1] || "Layanan aktif", url: m[2] || "", text: m[3] || "" };
}

function paintAiChip() {
  const chip = el("aiChip");
  if (!aiCtx) { chip.hidden = true; return; }
  el("aiChipText").textContent = "Konteks: " + aiCtx.title + " — " + aiCtx.text.length.toLocaleString("id-ID") + " karakter";
  chip.hidden = false;
}

function detachAiCtx() {
  aiCtx = null;
  el("aiCtxBtn").classList.remove("on");
  paintAiChip();
}

el("aiChipX").addEventListener("click", detachAiCtx);
el("aiCtxBtn").addEventListener("click", async () => {
  if (aiCtx) { detachAiCtx(); return; }  // the button is a toggle
  const btn = el("aiCtxBtn");
  btn.disabled = true;
  try {
    aiCtx = parseAiContext(await invoke("ai_extract_context"));
    btn.classList.add("on");
    paintAiChip();
    showToast("Konteks layar terlampir — ikut terkirim dengan pesan berikutnya.");
  } catch (err) {
    showToast(String(err || "Gagal mengambil konteks layar."));
  } finally {
    btn.disabled = false;
  }
});

// --- Settings -------------------------------------------------------
function paintAiSettings() {
  el("aiKeyInput").value = geminiKey();
  el("aiModelSel").value = geminiModel();
}
el("aiSettingsBtn").addEventListener("click", () => {
  const s = el("aiSettings");
  s.hidden = !s.hidden;
  if (!s.hidden) paintAiSettings();
});
el("aiKeySave").addEventListener("click", () => {
  localStorage.setItem("sodium.geminiKey", el("aiKeyInput").value.trim());
  localStorage.setItem("sodium.geminiModel", el("aiModelSel").value);
  scheduleConfigSave();
  el("aiSettings").hidden = true;
  paintAiSetup();
  showToast("Pengaturan Gemini disimpan.");
});
function openAiStudio() {
  invoke("open_external", { url: "https://aistudio.google.com/apikey" }).catch(() => {});
}
el("aiKeyLink").addEventListener("click", (e) => { e.preventDefault(); openAiStudio(); });
el("aiSetupLink").addEventListener("click", openAiStudio);

// --- Chat -----------------------------------------------------------
async function callGemini() {
  const contents = aiTurns.map(t => ({ role: t.role, parts: [{ text: t.text }] }));
  let res;
  try {
    res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(geminiModel()) + ":generateContent", {
      method: "POST",
      headers: { "x-goog-api-key": geminiKey(), "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: "Kamu adalah asisten AI di dalam aplikasi Sodium (pengelola banyak layanan web). Jawab dalam Bahasa Indonesia yang santai dan ringkas, kecuali pengguna memakai bahasa lain. Bila diberi konteks layar, anggap itu isi layanan web yang sedang dibuka pengguna." }] },
        contents,
      }),
    });
  } catch (e) {
    throw new Error("Tidak bisa menghubungi Gemini — periksa koneksi internet. (" + (e && e.message ? e.message : e) + ")");
  }
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON error body */ }
  if (!res.ok) {
    const apiMsg = data && data.error && data.error.message ? data.error.message : "";
    let hint = "";
    if (res.status === 400 || res.status === 403) hint = " Periksa kunci API dan model di Pengaturan panel.";
    else if (res.status === 429) hint = " Kuota gratis habis atau terlalu cepat — tunggu sebentar, lalu coba lagi.";
    throw new Error("Gemini menjawab HTTP " + res.status + (apiMsg ? ": " + apiMsg : ".") + hint);
  }
  const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
  const text = Array.isArray(parts) ? parts.map(p => p.text || "").join("") : "";
  if (!text) throw new Error("Gemini tidak memberi jawaban teks (mungkin tersaring pengaman). Coba rumuskan ulang pesanmu.");
  return text;
}

async function aiSend() {
  const text = aiInput.value.trim();
  if (!text || aiBusy || !geminiKey()) return;
  // The bubble shows only the user's own words; an attached screen
  // context rides along in the payload, then detaches.
  let payload = text;
  if (aiCtx) payload = "[Konteks layar — " + aiCtx.title + " (" + aiCtx.url + ")]\n" + aiCtx.text + "\n\n" + text;
  aiAddMsg("user", text);
  aiTurns.push({ role: "user", text: payload });
  detachAiCtx();
  aiInput.value = "";
  aiBusy = true;
  paintAiBusy();
  const typing = aiAddMsg("model", "Gemini sedang mengetik…");
  typing.classList.add("typing");
  try {
    const reply = await callGemini();
    typing.remove();
    aiAddMsg("model", reply);
    aiTurns.push({ role: "model", text: reply });
  } catch (err) {
    typing.remove();
    // Roll the failed turn back out of the history and hand the
    // message back to the input, so nothing the user typed is lost.
    aiTurns.pop();
    aiAddMsg("error", String(err && err.message ? err.message : err));
    aiInput.value = text;
  } finally {
    aiBusy = false;
    paintAiBusy();
    aiInput.focus();
  }
}

aiSendBtn.addEventListener("click", aiSend);
aiInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); aiSend(); }
});
paintAiSetup();

// YouTube adblock (v0.8.0): a small script maintained in the repo
// (adblock/youtube.js) and injected by Rust into YouTube service
// webviews at creation time. It updates independently of app
// releases: this UI periodically downloads the newest script from
// the repo, stores it (localStorage, mirrored to config.json) and
// hands it to Rust via set_adblock_script. The copy bundled with
// the app is the fallback until a download succeeds. The on/off
// switch is global for every youtube.com service.
const ADBLOCK_BUNDLED_VERSION = "1.0.0";
const ADBLOCK_MANIFEST_URL = "https://raw.githubusercontent.com/aindranto/Sodium/main/adblock/manifest.json";
const ADBLOCK_SCRIPT_URL = "https://raw.githubusercontent.com/aindranto/Sodium/main/adblock/youtube.js";
let ytAdblockEnabled = localStorage.getItem("sodium.ytAdblock") !== "0";
function ytAdblockInfo() {
  try { return JSON.parse(localStorage.getItem("sodium.ytAdblockInfo") || "{}"); } catch { return {}; }
}
function saveYtAdblockInfo(info) {
  localStorage.setItem("sodium.ytAdblockInfo", JSON.stringify(info)); scheduleConfigSave();
}
function ytAdblockVersion() {
  return ytAdblockInfo().version || ADBLOCK_BUNDLED_VERSION;
}
async function pushAdblockToRust() {
  try { await invoke("set_adblock_enabled", { enabled: ytAdblockEnabled }); } catch { /* older Rust */ }
  const script = localStorage.getItem("sodium.ytAdblockScript");
  if (script) { try { await invoke("set_adblock_script", { script }); } catch { /* older Rust */ } }
}
async function checkYtAdblock(manual) {
  try {
    const res = await fetch(ADBLOCK_MANIFEST_URL);
    if (!res.ok) throw new Error("http " + res.status);
    const man = await res.json();
    const latest = String(man.version || "").trim();
    if (!latest) throw new Error("no version");
    const info = ytAdblockInfo();
    info.lastCheck = Date.now();
    if (versionNewer(latest, ytAdblockVersion())) {
      const sres = await fetch(ADBLOCK_SCRIPT_URL);
      if (!sres.ok) throw new Error("http " + sres.status);
      const text = await sres.text();
      if (!text || !text.includes("youtube.com")) throw new Error("bad script");
      localStorage.setItem("sodium.ytAdblockScript", text); scheduleConfigSave();
      info.version = latest;
      info.source = "Unduhan";
      saveYtAdblockInfo(info);
      try { await invoke("set_adblock_script", { script: text }); } catch { /* older Rust */ }
      if (manual) showToast("Adblock YouTube diperbarui ke v" + latest + ".");
    } else {
      saveYtAdblockInfo(info);
      if (manual) showToast("Adblock YouTube sudah versi terbaru (v" + ytAdblockVersion() + ").");
    }
  } catch {
    if (manual) showToast("Gagal memeriksa update adblock — periksa koneksi internet.");
  }
  if (!adblockPanel.hidden) paintAdblockPanel();
}
function scheduleYtAdblockCheck() {
  const last = ytAdblockInfo().lastCheck || 0;
  if (Date.now() - last < 24 * 60 * 60 * 1000) return;
  setTimeout(() => checkYtAdblock(false), 7000);
}

let adblockReturnEditId = null;
async function openAdblockPanel(fromEditId) {
  adblockReturnEditId = fromEditId || null;
  paintAdblockPanel();
  await openPanel(adblockPanel);
}
function paintAdblockPanel() {
  const info = ytAdblockInfo();
  el("adblockToggle").checked = ytAdblockEnabled;
  el("adblockVersion").textContent = "v" + ytAdblockVersion() + " (" + (info.source || "Bawaan") + ")";
  el("adblockChecked").textContent = info.lastCheck ? new Date(info.lastCheck).toLocaleString("id-ID") : "Belum pernah";
}
el("adblockToggle").addEventListener("change", async () => {
  ytAdblockEnabled = el("adblockToggle").checked;
  localStorage.setItem("sodium.ytAdblock", ytAdblockEnabled ? "1" : "0"); scheduleConfigSave();
  try { await invoke("set_adblock_enabled", { enabled: ytAdblockEnabled }); } catch { /* older Rust */ }
});
el("adblockCheckBtn").addEventListener("click", () => checkYtAdblock(true));
el("adblockClose").addEventListener("click", async () => {
  const back = adblockReturnEditId;
  adblockReturnEditId = null;
  if (back) {
    const s = services.find(x => x.id === back);
    if (s) { await openEditDialog(s); return; }
  }
  await closePanels();
});

// Read the version from the app so it cannot go stale.
window.__TAURI__.app.getVersion()
  .then(v => { appVer = v; el("appVersion").textContent = "Sodium Beta v" + v; })
  .catch(() => {});

// Unread badge counts from Rust (page-title watcher in each service
// webview). Re-render the sidebar so the number appears/clears.
let popId = null;
window.__TAURI__.event.listen("unread-changed", (e) => {
  const [id, count] = e.payload;
  const prev = unread.get(id) || 0;
  if (count > 0) unread.set(id, count); else unread.delete(id);
  if (count > prev) popId = id;
  render();
});

// Ctrl+1..9 also arrives from Rust as a global shortcut while the
// Sodium window is focused (registered on window focus, released on
// blur), because keydown inside a service webview never reaches this UI.
window.__TAURI__.event.listen("shortcut-switch", (e) => {
  const s = services[Number(e.payload)];
  if (s) switchTo(s);
});

// "Mulai kelompok": right-clicking a named group separator in the
// sidebar opens this panel; confirming starts every (enabled)
// member hidden, then switches to the first one. switch_service's
// own eviction trims the alive set to the "Hidup bareng" limit.
let groupCtx = null;
async function openGroupPanel(name) {
  groupCtx = name;
  el("groupTitle").textContent = "Kelompok " + name;
  await openPanel(groupPanel);
}
el("groupCancel").addEventListener("click", closePanels);
el("groupStart").addEventListener("click", async () => {
  if (!groupCtx) return;
  const members = services.filter(s => groupOf(s) === groupCtx && !disabled.has(s.id));
  await closePanels();
  for (const m of members) {
    if (m.id === activeId) continue;
    try { await invoke("start_service_hidden", { id: m.id, url: m.url }); } catch { /* ignore */ }
  }
  if (members.length) switchTo(members[0]);
});

// Quick switcher (Alt+Space, arriving from Rust as a global
// shortcut while the window is focused): a centred panel listing
// every service — tile icon, name, group caption, an "Aktif" pill
// for the current service and an accent dot for services whose
// webview is alive. Type to filter by name or group; arrows +
// Enter or a click switch.
const quickList = el("quickList");
const quickSearch = el("quickSearch");
let quickRows = []; // { svc, row } entries currently shown (post-filter)
let quickSel = 0;
let quickAlive = new Set();

async function openQuickSwitch() {
  try {
    const labels = await invoke("alive_services");
    quickAlive = new Set(labels.map(l => l.startsWith("service-") ? l.slice("service-".length) : l));
  } catch { quickAlive = new Set(); }
  quickSearch.value = "";
  renderQuickList("");
  await openPanel(quickPanel);
  quickSearch.focus();
}

function renderQuickList(q) {
  const query = (q || "").trim().toLowerCase();
  quickList.innerHTML = "";
  quickRows = [];
  for (const s of services) {
    if (query && !s.name.toLowerCase().includes(query) && !groupOf(s).toLowerCase().includes(query)) continue;
    const row = document.createElement("div");
    row.className = "qRow" + (disabled.has(s.id) ? " off" : "");
    const tile = document.createElement("span");
    tile.className = "tileIcon qTile";
    if (s.img) {
      const im = document.createElement("img");
      im.className = "svcImg"; im.src = s.img; im.alt = "";
      const f = imgFilter(s); if (f) im.style.filter = f;
      // Same broken-favicon fallback as the sidebar.
      im.onerror = () => {
        im.replaceWith(iconVisual(s, 20));
        if (s.color) tile.style.background = s.color;
      };
      tile.appendChild(im);
    } else {
      if (s.color) tile.style.background = s.color;
      tile.appendChild(iconVisual(s, 20));
    }
    const info = document.createElement("div");
    info.className = "qInfo";
    const nm = document.createElement("div");
    nm.className = "qName";
    nm.textContent = s.name;
    info.appendChild(nm);
    const g = groupOf(s);
    if (g) {
      const cap = document.createElement("div");
      cap.className = "qGroup";
      cap.textContent = g;
      info.appendChild(cap);
    }
    row.append(tile, info);
    if (quickAlive.has(s.id)) {
      const dot = document.createElement("span");
      dot.className = "qAlive";
      dot.title = "Sedang hidup";
      row.appendChild(dot);
    }
    if (s.id === activeId) {
      const p = document.createElement("span");
      p.className = "mgPill pin";
      p.textContent = "Aktif";
      row.appendChild(p);
    }
    const entry = { svc: s, row };
    row.addEventListener("click", () => activateQuick(entry));
    row.addEventListener("mouseenter", () => {
      const i = quickRows.indexOf(entry);
      if (i >= 0) { quickSel = i; paintQuickSel(); }
    });
    quickRows.push(entry);
    quickList.appendChild(row);
  }
  if (!quickRows.length) {
    const d = document.createElement("div");
    d.className = "dlEmpty";
    d.textContent = "Tidak ada layanan yang cocok.";
    quickList.appendChild(d);
  }
  // Start on the active service when it is in the list.
  quickSel = Math.max(0, quickRows.findIndex(r => r.svc.id === activeId));
  paintQuickSel();
}

function paintQuickSel() {
  quickRows.forEach((r, i) => {
    const on = i === quickSel;
    r.row.classList.toggle("sel", on);
    if (on) r.row.scrollIntoView({ block: "nearest" });
  });
}

async function activateQuick(entry) {
  if (!entry) return;
  const s = entry.svc;
  await closePanels();
  // Disabled services open their menu instead, like a sidebar click.
  if (disabled.has(s.id)) { await openCtx(s); return; }
  switchTo(s);
}

quickSearch.addEventListener("input", () => renderQuickList(quickSearch.value));
quickSearch.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (quickSel < quickRows.length - 1) { quickSel++; paintQuickSel(); }
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (quickSel > 0) { quickSel--; paintQuickSel(); }
  } else if (e.key === "Enter") {
    e.preventDefault();
    activateQuick(quickRows[quickSel]);
  }
});

window.__TAURI__.event.listen("quick-switch", () => { openQuickSwitch(); });

// Export / import the whole configuration (services, groups, pins,
// zoom, settings) as one JSON file — the same snapshot shape that
// config.json uses. Login sessions live in the per-service profile
// folders and deliberately do NOT travel with it.
el("exportBtn").addEventListener("click", exportConfig);
el("importBtn").addEventListener("click", importConfig);

async function exportConfig() {
  const data = {};
  for (const k of CFG_KEYS) {
    const v = localStorage.getItem(k);
    if (v !== null) data[k] = v;
  }
  try {
    const done = await invoke("export_config", { data: JSON.stringify({ rev: cfgRev, data }) });
    if (done) showToast("Konfigurasi diekspor.");
  } catch { showToast("Gagal mengekspor konfigurasi."); }
}

async function importConfig() {
  let text;
  try { text = await invoke("import_config"); } catch { return; }
  if (!text) return; // dialog cancelled
  let snap;
  try {
    snap = JSON.parse(text);
    if (!snap || !snap.data || !Array.isArray(JSON.parse(snap.data["sodium.services"] || "null"))) {
      throw new Error("invalid config file");
    }
  } catch { showToast("File konfigurasi tidak valid."); return; }

  const oldUrls = new Map(services.map(s => [s.id, s.url]));
  const oldPinned = new Set(pinned);

  applyingConfig = true;
  for (const k of CFG_KEYS) {
    if (k in snap.data) localStorage.setItem(k, snap.data[k]);
    else localStorage.removeItem(k);
  }
  if (typeof snap.rev === "number") cfgRev = snap.rev;
  localStorage.setItem("sodium.cfgRev", String(cfgRev));
  applyingConfig = false;
  scheduleConfigSave();

  // Reload the in-memory state, mirroring applyConfigFromRust().
  services = store.load();
  pinned = store.pinned();
  disabled = store.disabled();
  showNames = localStorage.getItem("sodium.showNames") === "1";
  iconSize = parseInt(localStorage.getItem("sodium.iconSize") || "48", 10) || 48;
  applyIconSize();
  try { zoomByService = JSON.parse(localStorage.getItem("sodium.zoomByService") || "{}"); } catch { zoomByService = {}; }
  try { downloads = JSON.parse(localStorage.getItem("sodium.downloads") || "[]"); } catch { downloads = []; }
  el("showNamesToggle").checked = showNames;
  el("maxAlive").value = localStorage.getItem("sodium.maxAlive") || "1";

  // Push the restored settings into Rust.
  invoke("set_max_alive", { max: Number(localStorage.getItem("sodium.maxAlive") || "1") });
  for (const id of pinned) invoke("set_pinned", { id, pinned: true });
  for (const id of oldPinned) {
    if (!pinned.has(id)) invoke("set_pinned", { id, pinned: false });
  }

  // Webviews of services that vanished or changed URL must stop;
  // close_webview keeps their profile folders (sessions survive).
  let activeGone = false;
  for (const [id, url] of oldUrls) {
    const now = services.find(s => s.id === id);
    if (!now || now.url !== url) {
      await invoke("close_webview", { id });
      if (activeId === id) activeGone = true;
    }
  }
  if (activeId && !services.some(s => s.id === activeId)) activeGone = true;
  if (activeGone) {
    activeId = null;
    el("activeName").textContent = "Sodium Beta";
    el("welcome").style.display = "";
    showZoom();
  }

  render();
  renderManage();
  showToast("Konfigurasi diimpor.");
}

// Keyboard: Escape closes the link popup or any open panel;
// Ctrl/Cmd + 1..9 switches services; Alt+Space opens the quick
// switcher (fallback for when focus sits in this UI webview —
// inside a service webview the Rust global shortcut covers it).
window.addEventListener("keydown", async (e) => {
  if (e.altKey && e.code === "Space") {
    e.preventDefault();
    openQuickSwitch();
    return;
  }
  if (e.key === "Escape") {
    if (linkPopupOpen) { await closeLinkPopup(); return; }
    if (allPanels.some(p => !p.hidden)) { await closePanels(); return; }
  }
  if ((e.ctrlKey || e.metaKey) && /^[1-9]$/.test(e.key)) {
    const s = services[Number(e.key) - 1]; if (s) switchTo(s);
  }
});

// Zoom for the service view (browser-style page zoom), remembered PER
// SERVICE: WhatsApp can sit at 125% while Gmail stays at 100%. The old
// single "sodium.zoom" value remains as the default for services that
// have never been adjusted individually.
const ZOOM_STEPS = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0];
function getDefaultZoom() { return parseFloat(localStorage.getItem("sodium.zoom") || "1") || 1; }
let zoomByService = {};
try { zoomByService = JSON.parse(localStorage.getItem("sodium.zoomByService") || "{}"); } catch { zoomByService = {}; }
function zoomFor(id) { return (id && zoomByService[id]) || getDefaultZoom(); }
function zoomIdxFor(id) {
  const i = ZOOM_STEPS.indexOf(zoomFor(id));
  return i < 0 ? ZOOM_STEPS.indexOf(1.0) : i;
}
function showZoom() { el("zoomLabel").textContent = Math.round(zoomFor(activeId) * 100) + "%"; }
async function setZoomIdx(idx) {
  const scale = ZOOM_STEPS[idx];
  if (activeId) {
    zoomByService[activeId] = scale;
    localStorage.setItem("sodium.zoomByService", JSON.stringify(zoomByService)); scheduleConfigSave();
    await invoke("set_service_zoom", { id: activeId, scale });
  } else {
    // No service open: the buttons adjust the default for new services.
    localStorage.setItem("sodium.zoom", String(scale)); scheduleConfigSave();
  }
  showZoom();
}
el("zoomIn").addEventListener("click", () => { const i = zoomIdxFor(activeId); if (i < ZOOM_STEPS.length - 1) setZoomIdx(i + 1); });
el("zoomOut").addEventListener("click", () => { const i = zoomIdxFor(activeId); if (i > 0) setZoomIdx(i - 1); });
el("zoomLabel").addEventListener("click", () => setZoomIdx(ZOOM_STEPS.indexOf(1.0)));
showZoom();

// Startup: a newer config.json (Rust side) replaces the local
// working copy first; only then are settings pushed to Rust and
// the last session restored.
init();
async function init() {
  await applyConfigFromRust();

  // Adblock state goes to Rust before any service webview is
  // created below: the script and the switch only apply at
  // webview-creation time.
  ytAdblockEnabled = localStorage.getItem("sodium.ytAdblock") !== "0";
  await pushAdblockToRust();

  // "Hidup bareng" setting: how many non-pinned services may stay
  // alive. Stored locally, pushed to Rust on startup and on change.
  const maxAliveSel = el("maxAlive");
  const savedMax = localStorage.getItem("sodium.maxAlive") || "1";
  maxAliveSel.value = savedMax;
  invoke("set_max_alive", { max: Number(savedMax) });
  maxAliveSel.addEventListener("change", () => {
    localStorage.setItem("sodium.maxAlive", maxAliveSel.value); scheduleConfigSave();
    invoke("set_max_alive", { max: Number(maxAliveSel.value) });
  });

  // Restore pinned flags into the Rust side on startup
  for (const id of pinned) invoke("set_pinned", { id, pinned: true });
  render();

  // One-time favicon fetch for services that still have no icon image
  // (new custom services fetch theirs when they are added).
  for (const s of services) fetchFaviconFor(s);

  // Pinned services start hidden so their notifications work from
  // boot; the visible restore below reuses the webview if the
  // restored service is the pinned one.
  for (const id of pinned) {
    const s = services.find(x => x.id === id);
    if (s && !disabled.has(id)) {
      try { await invoke("start_service_hidden", { id: s.id, url: s.url }); } catch {}
    }
  }

  // First run: show the service picker once. Otherwise reopen the
  // service that was active when Sodium was closed, like Ferdium
  // does, instead of landing on the welcome screen.
  if (!localStorage.getItem("sodium.onboarded")) {
    openPicker();
  } else {
    const lastId = localStorage.getItem("sodium.lastActive");
    const last = services.find(s => s.id === lastId);
    if (last && !disabled.has(last.id)) switchTo(last);
  }
  scheduleAutoUpdateChecks();
  scheduleYtAdblockCheck();
}

async function applyConfigFromRust() {
  try {
    const text = await Promise.race([
      invoke("load_config"),
      new Promise(r => setTimeout(() => r(null), 800)),
    ]);
    if (!text) { scheduleConfigSave(); return; }
    const snap = JSON.parse(text);
    if (!snap || !snap.data || !(snap.rev > cfgRev)) return;
    applyingConfig = true;
    for (const k of CFG_KEYS) {
      if (k in snap.data) localStorage.setItem(k, snap.data[k]);
      else localStorage.removeItem(k);
    }
    cfgRev = snap.rev;
    localStorage.setItem("sodium.cfgRev", String(cfgRev));
    applyingConfig = false;
    services = store.load();
    pinned = store.pinned();
    disabled = store.disabled();
    showNames = localStorage.getItem("sodium.showNames") === "1";
    iconSize = parseInt(localStorage.getItem("sodium.iconSize") || "48", 10) || 48;
    applyIconSize();
    try { zoomByService = JSON.parse(localStorage.getItem("sodium.zoomByService") || "{}"); } catch { zoomByService = {}; }
    el("showNamesToggle").checked = showNames;
  } catch { applyingConfig = false; }
}
