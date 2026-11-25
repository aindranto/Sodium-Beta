# Sodium — Blueprint Rebuild Ringan (basis: Ferdium)
Dibedah dari: github.com/ferdium/ferdium-app (branch develop, v7.2.4-nightly.4, Electron 44.2.0) — 21 Nov 2026

## 1. Kenapa Ferdium berat (hasil bedah repo asli)

1. **Electron = bawa Chromium sendiri.** Installer ~150-200 MB, shell kosong aja ~200 MB RAM sebelum ada layanan apa pun.
2. **Tiap layanan = 1 proses Chromium hidup.** Setiap service adalah `<webview>` Electron dengan partition terisolasi (cookie/storage sendiri) di `src/components/services/content/ServiceWebview.tsx`. WhatsApp Web / Telegram / Gmail sendiri memang berat: ~150-250 MB per layanan aktif. 6 layanan = 0,9-1,5 GB. Ini biaya terbesar, bukan UI-nya.
3. **Hibernasi ada tapi MATI secara default per layanan.** `src/config.ts`: `DEFAULT_SERVICE_SETTINGS.isHibernationEnabled: false`. Strategi global 300 detik & `hibernateOnStartup: true` tidak menolong kalau per-service-nya off. Secara default semua layanan tetap hidup bersamaan.
4. **Shell-nya sendiri gemuk.** 498 file / ~38 ribu baris di `src/`, 82 dependencies + 63 devDependencies: React 18 + MobX + MUI 5 + Emotion, PLUS server internal AdonisJS 5 + SQLite yang jalan di localhost (`src/internal-server/`) cuma buat mode lokal, PLUS sistem recipes (submodule ferdium-recipes, ratusan layanan), workspaces, todos, translator, dark reader, Sentry, dll.

Kesimpulan jujur: mengganti Electron -> Tauri SAJA tidak menyelesaikan masalah di Windows, karena WebView2 di Windows juga Chromium — 1 halaman WhatsApp Web tetap ~150-250 MB di shell apa pun. Yang bikin jauh lebih ringan adalah **arsitekturnya**, bukan cuma framework-nya.

## 2. Desain rebuild: Sodium

**Stack:** Tauri 2 (Rust) + WebView bawaan OS (WebView2 di Windows / WebKitGTK di Linux / WKWebView di macOS) + UI sidebar polos (HTML/CSS/JS kecil, tanpa React/MUI/MobX).

**Prinsip hemat RAM:**
1. **Hanya 1 webview hidup dalam satu waktu** (mode Ultra), atau maks 2-3 untuk layanan yang di-pin (mode Seimbang). Layanan lain **dimusnahkan total** (bukan disembunyikan) — RAM-nya benar-benar bebas.
2. **Sesi tetap awet:** cookie/localStorage tiap layanan disimpan per-partisi di disk, jadi pas balik ke layanan itu tetap login, tinggal reload 1-3 detik.
3. **Tanpa server internal, tanpa database server.** Konfigurasi = 1 file JSON lokal. Daftar layanan = URL custom, bukan sistem recipes ratusan layanan.
4. **Fitur dipangkas ke yang dipakai harian:** sidebar layanan, tambah/hapus layanan custom, badge judul (dari title halaman), tray, shortcut pindah layanan (Ctrl+1..9), dark mode sederhana.
5. **Yang dikorbankan (disadari):** layanan non-aktif tidak mengirim notifikasi/unread real-time (karena memang tidak hidup). Di mode Seimbang, layanan prioritas (mis. WhatsApp) bisa di-pin tetap hidup supaya notifikasinya jalan.

**Target realistis (Windows, 6 layanan terdaftar):**
| | Ferdium asli | Sodium Ultra (1 aktif) | Sodium Seimbang (2 aktif) |
|---|---|---|---|
| Installer | ~150-200 MB | ~5-15 MB | ~5-15 MB |
| RAM total | ~1,1-1,7 GB | ~250-350 MB | ~400-550 MB |
| Pindah layanan | instan | reload 1-3 detik | pin = instan, lain reload |

Angka layanan aktif per halaman adalah sifat web app-nya sendiri (WhatsApp Web dkk), bukan klaim framework — makanya jumlah webview hidup yang dikunci.

## 3. Keputusan Agung (21 Nov 2026)
- OS target: **Windows** (WebView2)
- Layanan default: **WhatsApp saja** — tapi Sodium tetap mendukung **banyak layanan tanpa batas**: layanan lain ditambah sendiri lewat custom URL ("+ Tambah layanan"); yang dibatasi cuma jumlah yang *hidup bersamaan* (default 1), bukan jumlah yang terdaftar
- Mode: jumlah layanan hidup bersamaan **bisa di-custom user** (keputusan Agung 21 Nov) — setting *Hidup bareng* 1/2/3/5/∞ di sidebar, default 1; yang kena eviction = non-pin paling lama tidak dipakai (LRU); pin selalu bebas eviction

## 4. Rencana build v1
1. Scaffold Tauri 2 + sidebar layanan dari config JSON
2. Webview per layanan dengan data-directory terpisah, destroy-on-switch
3. Pin service, tray, shortcut, persist sesi
4. Build installer Windows (.msi/.exe) — verifikasi ukuran + ukur RAM dengan layanan nyata Agung

## Versioning (aturan sejak 23 Nov 2026, keputusan Agung)

- **Patch (0.6.x)** — perbaikan, poles UI, penyempurnaan fitur yang
  sudah ada. Mayoritas rilis di sini.
- **Minor (0.x.0)** — hanya untuk kemampuan yang benar-benar baru.
- **1.0** — keputusan sadar Agung bahwa Sodium matang untuk publik,
  bukan hasil kehabisan angka.

## 5b. Status Sodium Beta (repo ini, sejak 25 Nov 2026)

Repo **aindranto/Sodium-Beta** adalah salinan eksperimental dari
Sodium stabil v0.8.1 untuk menguji **panel AI**. Bentuknya berubah
sejak uji pertama: beta.1 memakai panel web (webview muse.ai /
gemini.google.com di-dock di kanan + injektor DOM untuk konteks
layar); sejak **0.9.1-beta.1** panelnya **native Gemini** — chat
digambar UI Sodium sendiri di kolom kanan, otaknya Gemini API
(kunci AI Studio gratis milik pengguna, disimpan lokal), dan
konteks layar dilampirkan ke permintaan API (ekstraksi teks
layanan aktif tetap lewat Rust). Panel web dan injektor sudah
dicabut; Muse tetap tersedia sebagai layanan biasa dari katalog.
Aturannya:

- Repo ini eksperimen: identitas aplikasi terpisah
  (`Sodium Beta`, `id.sodium.beta`) supaya terpasang berdampingan
  dengan versi stabil dan tidak menimpanya.
- Kanal update beta hanya dari repo ini (pemeriksa update menunjuk
  `aindranto/Sodium-Beta/releases/latest`); repo stabil tidak
  disentuh sama sekali.
- Bila panel AI-nya berhasil, fiturnya di-porting ke repo utama
  (aindranto/Sodium) dan repo ini dipensiunkan; bila gagal, repo
  ini dibiarkan/dibuang tanpa jejak di jalur stabil.

## 6. Catatan v0.8.0 (25 Nov 2026)

- **Panel Kelola gaya Container** (Firefox/Zen): daftar seret-untuk-urut
  (handle grip; tombol naik/turun pensiun), pensil membuka satu dialog
  edit per layanan, tempat sampah menghapus lewat dialog konfirmasi.
  Panel ikon terpisah dihapus — editor ikon menyatu ke dialog edit.
- **Editor ikon**: sumber logo brand / glyph SVG / teks inisial /
  gambar upload (draft, berlaku saat Simpan). Pilihan eksplisit selalu
  menang atas logo brand (memperbaiki bug teks tak pernah tampil untuk
  layanan ber-brand). **Slider hue** -180..+180 untuk ikon gambar,
  disimpan per layanan (`hue`), diterapkan sebagai CSS `hue-rotate()`.
- **Katalog 31 layanan** (+Lazada, Blibli, Bukalapak, Threads, ChatGPT,
  Gemini, Claude, Notion, Zoom, Google Drive). Tokopedia/Lazada/ChatGPT
  tidak ada di Simple Icons → glyph bawaan. **Emoji dihapus total**
  (keputusan Agung: terkesan jadul); ikon tersimpan yang emoji
  dimigrasi lembut ke inisial nama.
- **Notifikasi update aplikasi**: titik penanda persisten di tombol
  update, cek otomatis saat startup + tiap 6 jam, cek gagal tidak
  menghanguskan jadwal, panel tidak lagi auto-popup.
- **Adblock khusus YouTube**: script di `adblock/youtube.js` (repo)
  di-inject Rust hanya ke webview ber-host youtube.com; panel sendiri
  (saklar global, versi skrip, cek manual) dan **update terpisah**
  dari rilis aplikasi lewat `adblock/manifest.json`. Adblock umum +
  DNS tetap tidak dibangun (keputusan lama Agung).
