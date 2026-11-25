# Audit Keamanan P0 — Sodium v0.5.1

Tanggal: 23 Nov 2026 · Basis: HEAD main 8206e3e (v0.5.1)
Metode: pembacaan konfigurasi + kode, dicocokkan dengan model
keamanan terdokumentasi Tauri 2. Tes negatif runtime (mencoba
invoke dari halaman layanan di aplikasi yang berjalan) tidak
dilakukan di dokumen ini; vonis bertumpu pada konfigurasi dan
penegakan sisi Rust yang didokumentasikan Tauri.

## 1. Pembatasan IPC berdasarkan origin — LULUS (konfigurasi)

- Satu-satunya capability: `src-tauri/capabilities/default.json`
  — `windows: ["main"]`, permissions `core:default`, **tanpa
  field `remote`**.
- Model Tauri 2: webview/jendela yang tidak cocok dengan
  capability mana pun tidak punya akses IPC sama sekali; konten
  remote hanya bisa memakai IPC bila capability memberi izin
  `remote.urls` secara eksplisit (default: nonaktif). Command
  aplikasi sendiri hanya diizinkan untuk konten lokal/bundled.
- Webview layanan memuat origin remote (mis. web.whatsapp.com),
  jadi panggilannya ke command seperti `switch_service`,
  `open_external`, `save_config` ditolak di sisi Rust.
- Rekomendasi: jangan pernah menambahkan capability ber-`remote`
  untuk origin layanan.

## 2. Audit capability per WebView — LULUS

- Tidak ada capability lain di `src-tauri/capabilities/`.
- Webview UI (`ui`, konten lokal) adalah satu-satunya pemakai
  IPC; webview layanan dan popup tidak diberi permission apa pun.

## 3. Navigasi eksternal — SESUAI DESAIN (keputusan tercatat)

- Navigasi frame utama bebas secara sengaja: alur login banyak
  layanan melompat antar-domain (mis. akun Google), allowlist
  domain akan merusaknya.
- Permintaan jendela baru dicegat → popup link (URL terlihat,
  pengguna memilih: salin / buka di browser / buka di popup).
- `open_external` hanya menerima skema http/https.
- `valid_url` di Rust: webview layanan/popup hanya boleh memuat
  http/https.

## 4. Isolasi profil & sesi per akun — LULUS

- Direktori data per layanan: `app_data/profiles/<id>` —
  environment WebView2 terpisah per akun.
- `valid_id`: hanya `[a-z0-9-]`, maks 64 char → path traversal
  (`..`, `/`, `\`) tidak mungkin.
- Hapus layanan menghapus folder profilnya sendiri saja.

## 5. Download & upload — LULUS

- Download tidak pernah menulis tanpa dialog Simpan Sebagai
  native; Batal → handler mengembalikan false, unduhan batal.
  Nama file dari halaman hanya menjadi saran di dialog; tujuan
  akhir persis yang dipilih pengguna.
- Upload memakai pemilih file native WebView2 milik halaman;
  Sodium tidak menambah jalur upload sendiri.
- Drag & drop (v0.5.1) diteruskan ke halaman — tingkat kepercayaan
  sama seperti browser.

## Catatan: CSP masih null

`tauri.conf.json` `app.security.csp = null` — UI lokal tidak
punya Content Security Policy. Risiko praktis saat ini rendah:
semua string tak terpercaya (nama file unduhan, nama layanan,
URL) dirender UI lewat `textContent` (terverifikasi di
`renderDownloads` dll.); `innerHTML` hanya dipakai untuk
mengosongkan kontainer dan satu SVG statis dari tabel ikon
bawaan. CSP tetap layak sebagai pengerasan defense-in-depth —
statusnya tidak berubah: menunggu keputusan sebagai paket
terpisah.
