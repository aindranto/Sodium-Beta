# Sodium Beta (Na)

> Semua layanan sosial dan perpesanan Anda dalam satu tempat — **dengan cara yang ringan.**

> **Ini build eksperimental (Beta).** Sodium Beta adalah salinan Sodium stabil dengan satu fitur uji coba: **panel AI native Gemini** — panel chat yang digambar langsung oleh UI Sodium di sisi kanan jendela (bukan halaman web yang ditempel), dengan otak **Gemini lewat API**. Panel ini perlu **kunci API Google AI Studio (gratis)** yang dimasukkan sekali di pengaturan panel. Lewat tombol konteks layar, teks layanan yang sedang dibuka bisa dilampirkan ke pesan berikutnya sebagai konteks. (Build beta pertama memakai panel web Muse/Gemini + injektor DOM; sejak 0.9.1 diganti native ini, dan Muse tetap bisa ditambah sebagai layanan biasa dari katalog.) Versi stabil tanpa panel AI ada di repo **[aindranto/Sodium](https://github.com/aindranto/Sodium)**.
>
> Sodium Beta **terpasang berdampingan** dengan Sodium stabil: nama, identifier (`id.sodium.beta`), folder data, dan kanal update-nya terpisah, jadi memasang beta ini tidak menimpa instalasi stabil Anda. Kalau panel AI-nya terbukti berguna, fiturnya akan di-porting ke repo utama; kalau tidak, repo ini berhenti di sini dan versi stabil tidak terpengaruh sama sekali.

**Sodium** adalah pembangunan ulang konsep [Ferdium](https://github.com/ferdium/ferdium-app) dalam versi yang jauh lebih ringan. Aplikasi ini dibuat karena Ferdium (Electron) membutuhkan sumber daya yang besar: sekitar 200 MB untuk cangkang aplikasinya saja, ditambah 150–250 MB untuk *setiap* layanan yang dibiarkan terbuka.

Asal namanya: Ferdium dinamai seperti unsur kimia, sehingga versi ringannya adalah **Sodium** — unsur sungguhan (`Na`) dan salah satu logam paling ringan. **So**dium untuk **So**cial.

> Sodium merupakan reimplementasi *clean-room* yang terinspirasi dari ide Ferdium, bukan fork dari kode sumbernya.

## Tampilan

![Layar sambutan Sodium](docs/screenshots/welcome.png)
*Layar sambutan — tiga kartu fitur utama.*

![Pemilih layanan](docs/screenshots/picker.png)
*Pemilih layanan — 31 layanan populer sekali klik, plus custom URL.*

![Menu klik kanan layanan](docs/screenshots/context-menu.png)
*Menu klik kanan — pin, nonaktifkan, atau buka Kelola layanan.*

## Mengapa Sodium lebih ringan?

Mengganti framework saja tidak menyelesaikan persoalan RAM di Windows, karena WebView2 juga berbasis Chromium — satu halaman WhatsApp Web tetap membutuhkan sumber daya yang sama. Penghematan Sodium berasal dari arsitekturnya:

1. **Tauri 2 dan webview bawaan sistem operasi**, bukan Chromium yang dibundel. Hasilnya, ukuran installer hanya sekitar 2 MB dan RAM cangkang aplikasi hanya puluhan MB.

Anda dapat mendaftarkan **layanan dalam jumlah tak terbatas** — WhatsApp terpasang sejak awal, layanan lain dapat dipilih dari katalog atau ditambahkan sebagai custom URL. Yang diatur Sodium bukanlah jumlah layanan yang boleh didaftarkan, melainkan jumlah yang *aktif*:

2. **Jumlah webview yang tetap aktif adalah pilihan Anda** (bar atas: *Hidup bareng* — 1 / 2 / 3 / 5 / ∞, bawaan 1). Berpindah layanan melebihi batas tersebut akan *memusnahkan* webview yang paling lama tidak digunakan, bukan sekadar menyembunyikannya. Daftarkan 10 layanan, dan penggunaan RAM tetap sebatas jumlah pilihan Anda. Layanan yang di-pin dikecualikan dari pemusnahan.
3. **Layanan yang di-pin adalah pengecualian** — pin WhatsApp, dan layanan tersebut tetap aktif untuk menerima notifikasi selama Anda menggunakan layanan lain.
4. **Sesi tersimpan di disk** untuk setiap layanan (folder profil masing-masing), sehingga layanan yang dimusnahkan dapat dibuka kembali dalam keadaan tetap masuk — cukup memuat ulang selama 1–3 detik.
5. **Tanpa server internal, tanpa database, dan tanpa sistem recipes untuk ratusan layanan.** Konfigurasi tersimpan secara lokal; layanan hanyalah URL yang Anda tambahkan sendiri.

Platform target: **Windows** (WebView2, sudah terpasang pada Windows 11). Perkiraan penggunaan dengan 6 layanan terdaftar: **sekitar 250–350 MB secara total**, dibandingkan 1,1–1,7 GB pada Ferdium dengan 6 layanan aktif sekaligus.

Analisis lengkap mengenai kode sumber Ferdium dan pertimbangan desainnya tersedia di [docs/BLUEPRINT.md](docs/BLUEPRINT.md).

## Fitur

- **Pemilih layanan** bergaya Ferdium yang tampil saat aplikasi pertama kali dibuka (dan melalui tombol "+"): 31 layanan populer yang ditambahkan dengan sekali klik — klik lagi untuk menambah akun kedua, ketiga, dan seterusnya pada layanan yang sama — dilengkapi kolom pencarian. Custom URL tetap tersedia.
- **Ikon khusus untuk setiap layanan, tanpa emoji**: logo asli brand dari katalog (Simple Icons), set **glyph SVG** generik untuk layanan tanpa logo brand, teks inisial 1-2 huruf, atau **unggahan gambar sendiri** (.jpg / .jpeg / .png / .ico) — lengkap dengan **warna tile dan warna logo** yang dapat diatur sendiri, plus **slider hue** (-180..+180) untuk mewarnai ulang ikon gambar. Pilihan ikon Anda selalu menang atas logo brand bawaan.
- **Bar atas** berisi nama layanan yang sedang aktif, tombol **muat ulang** layanan, **zoom** tampilan layanan (50%–200%, tersimpan secara permanen), pengaturan *Hidup bareng*, indikator unduhan, dan tombol **Cek update**.
- **Pin** layanan agar selalu aktif (misalnya WhatsApp untuk notifikasi), **nonaktifkan** layanan untuk mematikannya secara total untuk sementara tanpa kehilangan sesi masuk, serta pintasan **Ctrl+1..9** untuk berpindah layanan.
- **Tray & jalan di latar**: menutup jendela menyembunyikan Sodium ke system tray — layanan tetap hidup dan notifikasi tetap berjalan; keluar sepenuhnya melalui menu tray. Layanan yang di-pin **menyala otomatis saat startup** secara tersembunyi, jadi notifikasinya bekerja sejak awal.
- **Panel Kelola gaya Container** (seperti pengaturan Container di Firefox/Zen): daftar layanan dengan **handle seret** untuk mengubah urutan, ikon pensil untuk membuka **satu dialog edit per layanan** (nama, URL, kelompok, ikon, warna, pin, nonaktifkan, duplikat), dan ikon tempat sampah untuk menghapus (dengan dialog konfirmasi).
- **Tema Obsidian Na** — tema gelap netral nyaris hitam dengan satu aksen kuning Na, token warna CSS, dan animasi mikro halus (panel membuka lembut, indikator aktif meluncur di sidebar, badge unread memantul saat bertambah). Mati otomatis bila Windows disetel mengurangi animasi.
- **Tarik & letakkan file** langsung ke halaman layanan (misalnya melampirkan file di WhatsApp), sama seperti di browser.
- **Unduhan**: dialog Simpan Sebagai, indikator unduhan yang sedang berjalan di bar atas, dan panel **riwayat unduhan** dengan tombol buka folder.
- **Cek update**: tombol di bar atas membandingkan versi terpasang dengan rilis terbaru di GitHub; pemeriksaan otomatis berjalan saat startup dan tiap 6 jam, dan **titik penanda** di tombol update menyala selama ada versi baru (panel dibuka dari tombolnya, tidak lagi muncul sendiri). Installer versi baru diunduh langsung di dalam Sodium (dengan dialog Simpan Sebagai dan riwayat unduhan), lalu bisa dijalankan dari panel update — Sodium menutup sendiri agar installer menggantikannya.
- **Adblock khusus YouTube**: script kecil yang disuntikkan hanya ke layanan YouTube — menyembunyikan slot iklan dan melewati iklan video. Ada panelnya sendiri (klik kanan tile YouTube) dengan saklar aktif/nonaktif, dan script-nya **bisa diperbarui terpisah** dari rilis aplikasi karena dirawat sebagai file tersendiri di repo ini (`adblock/youtube.js`).
- **Kelompok layanan**: beri nama kelompok pada layanan lewat panel Kelola (mis. "Kerja", "Pribadi") — sidebar menampilkan **garis pemisah** antar kelompok agar daftar panjang tetap enak dipindai.
- **Quick Switcher**: tekan **Alt+Space** untuk membuka panel ganti layanan di tengah layar — ketik nama layanan (atau nama kelompoknya), lalu Enter atau klik untuk langsung pindah. Layanan yang sedang aktif dan yang sedang hidup ikut ditandai.
- **Mulai kelompok**: klik kanan garis pemisah kelompok di sidebar untuk menghidupkan semua layanan dalam kelompok itu sekaligus (batas *Hidup bareng* tetap berlaku seperti biasa).
- **Ekspor & impor konfigurasi**: cadangkan daftar layanan, kelompok, pin, zoom, dan pengaturan ke satu file JSON dari panel Kelola, lalu pulihkan di PC lain. Sesi login tidak ikut berpindah — di PC baru, login ulang per layanan.
- **Penyimpanan awet**: daftar layanan dan pengaturan tersimpan di file `config.json`, sehingga tidak hilang walau data webview terhapus.
- **Duplikat (akun beda)** melalui panel Kelola layanan: menyalin URL dan ikon dengan profil yang masih kosong, untuk masuk dengan akun lain pada layanan yang sama.
- **Ganti nama** layanan melalui panel Kelola layanan: nama bebas tanpa memengaruhi sesi masuk, pin, atau zoom (semua terikat pada id layanan, bukan nama). Layanan custom URL tanpa logo katalog mengambil favicon situsnya secara otomatis.
- **Panel Kelola layanan** (tombol di sidebar, di bawah tombol "+"): semua pengaturan layanan dalam satu tempat — edit nama, ikon, dan **URL** lewat dialog edit (webview ditutup dan dibuka ulang bila URL berubah), urutan layanan diubah dengan menyeret handle, pin, nonaktifkan, duplikat, dan hapus — plus saklar menampilkan nama layanan di bawah ikon sidebar dan pilihan **ukuran ikon sidebar** (Kecil/Sedang/Besar, berguna di monitor resolusi rendah). Menu klik kanan ramping (Pin/Unpin, Nonaktifkan/Aktifkan lagi, Kelola layanan) dan tampil sebagai panel di tengah layar.
- Notifikasi situs dapat diaktifkan, karena Sodium menjawab permintaan izin notifikasi dengan benar; notifikasi tiap layanan kemudian ditampilkan sebagai notifikasi Windows oleh WebView2, sama seperti di browser.

## Pengembangan

Persyaratan: [Rust](https://www.rust-lang.org/tools/install), Node 20+, runtime WebView2 pada Windows (sudah terpasang pada Windows 11), atau `webkit2gtk` pada Linux.

```bash
npm install
npm run dev     # tauri dev
npm run build   # tauri build -> installer tersedia di src-tauri/target/release/bundle
```

## Lisensi

MIT. Konsep terinspirasi dari Ferdium (Apache-2.0) — terima kasih kepada komunitas Ferdium.
