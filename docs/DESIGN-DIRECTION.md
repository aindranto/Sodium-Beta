# Arah Desain Sodium — Usulan v0.6

Disusun 23 Nov 2026. Referensi: Linear (sistem surface & border),
Raycast (kepadatan daftar & panel), Discord (rail ikon),
Beeper (jarak & whitespace), Arc (frame konten — fase opsional).
Dokumen ini usulan untuk didiskusikan, bukan keputusan final.

## Prinsip

1. **Satu aksen.** Kuning Na `#F5C518` adalah satu-satunya warna
   brand. Semua permukaan netral (abu tanpa rona biru). Warna lain
   hanya semantik: merah = unread/bahaya.
2. **Kedalaman dari lapisan, bukan bayangan.** Tiga tingkat
   surface + border 1px halus. Shadow hanya untuk panel melayang.
3. **Tenang & padat.** Chrome aplikasi tidak bersaing dengan
   konten layanan. Kepadatan ala Raycast, gerak seminimal Linear.
4. **Token dulu.** Semua warna jadi CSS variable; tidak ada lagi
   hex tersebar. Ganti rasa visual = ganti token, bukan berburu
   hex di 200 baris CSS.

## Token warna — sekarang → usulan

| Peran | Sekarang | Usulan | Catatan |
|---|---|---|---|
| bg dasar | `#14161A` | `#0E0F12` | area welcome & celah |
| chrome (sidebar/topbar) | `#1B1E24` | `#15171C` | |
| panel/modal | `#1B1E24` | `#17191F` | setingkat di atas chrome |
| raised (baris, tile, tombol ghost) | `#262A33` | `#1F2127` | |
| hover | `#2F3441` | `#26282F` | |
| pressed | — | `#1A1C21` | baru, formal |
| border halus (divider chrome) | `#262A33` | `#22242A` | |
| border tegas (input, kartu) | `#333947` | `#2C2E36` | |
| teks utama | `#E8EAF0` | `#F2F3F5` | |
| teks redup | `#9AA3B5` | `#9BA1AB` | rona biru dibuang |
| teks samar (meta/timestamp) | — | `#6E727C` | baru |
| aksen | `#F5C518` | `#F5C518` | tetap, identitas Na |
| aksen hover / pressed | `#FFCF3D` / `#E0AF14` | tetap | |
| aksen samar (latar terpilih) | — | `rgba(245,197,24,.12)` | baru |
| bahaya (latar / teks) | `#5A2326` / `#F0B4B8` | `rgba(229,72,77,.14)` / `#F09399` | gaya tint modern |
| badge unread | `#E5484D` | tetap | solid, terbaca di atas ikon apa pun |

Perubahan rasa terbesar: rona biru-abu (`#262A33`, `#333947`,
`#9AA3B5`) diganti abu netral; kontras antar-lapisan diperjelas
satu langkah; border diperhalus.

## Tipografi

- Font tetap `system-ui` (tanpa webfont — ringan & offline).
- Skala: 11 meta · 12 sekunder · 13 isi · 14 penekanan ·
  18 judul panel · 36 judul welcome (tetap).
- Bobot: 400 isi, 600 judul & label (turun dari 700 di banyak
  tempat — lebih Linear), 700 hanya untuk angka badge & tombol
  primer.

## Radius, spasi, elevasi, gerak

- Radius formal: 8 kontrol kecil · 10 ikon dalam baris ·
  12 baris/kartu · 14 tile & ikon sidebar · 16 modal · 99 pil.
- Spasi berbasis 4: 4/8/12/16/24. Padding panel 20, antar-baris
  daftar 8.
- Elevasi: satu token shadow panel `0 12px 40px rgba(0,0,0,.5)`
  (sudah dipakai, diformalkan). Elemen non-melayang tanpa shadow.
- Gerak (baru — sekarang semua perpindahan warna instan):
  transisi 120ms ease untuk hover/aktif di tombol, tile, baris;
  tombol ditekan `scale(.98)`. Tidak ada animasi dekoratif lain.

## Paket gerak (disetujui arahnya 23 Nov malam — "Obsidian Na")

Animasi hanya mikro-interaksi: memberi umpan balik & kontinuitas
gerak, bukan dekorasi. Aturan keras:

- Durasi 100–180ms, ease-out. Tidak ada yang di atas 200ms.
- Hanya `transform` + `opacity` yang dianimasikan (murah di GPU,
  tanpa layout thrash) — janji ringan Sodium tetap berlaku.
- Tanpa animasi berulang/ambient, tanpa animasi di lapisan
  webview layanan (native, tidak bisa & tidak boleh dipalsukan).
- Hormati `prefers-reduced-motion`: semua gerak mati bila
  pengguna mematikan animasi di Windows.

Isi paket:

1. **Panel buka/tutup** — fade + naik 4px, 140ms. Sumber rasa
   "kaku" terbesar saat ini: semua panel muncul seketika.
2. **Pil aktif meluncur** — pil Discord di rail berpindah ke ikon
   aktif baru dengan transisi transform, bukan melompat.
3. **Hover & tekan** — transisi warna 120ms; tombol `scale(.98)`
   saat ditekan.
4. **Badge memantul kecil** — scale 1→1,25→1 (150ms) saat angka
   unread bertambah. Informatif, bukan hiasan.
5. **Toast & pil unduhan** — masuk dengan fade + geser turun
   150ms.
6. **Welcome** — kartu fitur fade-up berjenjang 40ms, hanya saat
   layar sambutan tampil. Satu-satunya sentuhan "dekoratif",
   karena halamannya statis.

## Aturan per komponen

- **Rail sidebar (Discord):** indikator layanan aktif diganti —
  dari border kuning 2px mengelilingi ikon menjadi **pil kuning
  4×24px di tepi kiri rail** + latar ikon `surface hover`. Ikon
  aktif tidak lagi "berteriak"; pin tetap titik kuning, badge
  tetap pil merah kanan-atas. Radius ikon 14 dipertahankan.
- **Topbar:** latar chrome, divider border halus. Nama layanan
  14/600. Tombol alat: ghost transparan → hover raised, ikon
  warna redup → teks utama saat hover (sudah hampir begitu,
  diformalkan). Pil unduhan tetap beraksen kuning.
- **Tombol:** primer kuning (teks gelap) hanya untuk aksi utama
  satu-satunya per panel (Simpan/Tambah). Selebihnya ghost raised.
  Bahaya = tint merah, bukan blok merah pekat.
- **Input:** latar bg dasar, border tegas, fokus = border aksen
  + outline yang sudah ada. Radius 8.
- **Panel modal (Raycast):** judul 18/600, subteks 12 redup.
  Daftar Kelola: baris 12-radius di raised, tombol aksi kecil
  ghost; kepadatan dipertahankan, warna diselaraskan token.
- **Picker layanan:** tile raised, hover naik satu tingkat +
  transisi; ikon tile 48 radius 12 (tetap). Badge jumlah `×n`
  pakai pil bg dasar/teks redup (tetap).
- **Panel ikon (gaya lama):** ikut token yang sama; migrasi ke
  modal tengah tetap keputusan terpisah.
- **Toast:** pil raised + border tegas (sekarang sudah pil —
  diselaraskan token saja).
- **Welcome:** kartu fitur surface panel + border halus; ikon
  kartu dalam kotak raised radius 10; aksen kuning hanya di tile
  Na dan tombol utama.
- **Scrollbar & fokus:** thumb border tegas di atas bg; cincin
  fokus aksen 2px (tetap).

## Fase implementasi

1. **Fase 1 — Token & palet** (inti v0.6): CSS variables, palet
   netral baru, radius/spasi diformalkan, gaya tint bahaya.
   Murni CSS, risiko rendah, tidak menyentuh JS/Rust.
2. **Fase 2 — Mikro-interaksi**: pil aktif Discord, transisi
   120ms, scale .98. Masih CSS (+ satu elemen pil di render ikon).
3. **Fase 3 — Opsional, eksperimen**: frame inset ala Arc untuk
   area layanan (margin di sekeliling webview). Menyentuh batas
   webview di Rust; sudut webview tetap siku (WebView2 tidak bisa
   rounded) — dinilai lagi setelah Fase 1–2 terlihat hasilnya.

## Yang TIDAK diubah

- Tata letak umum (rail 76px, topbar 44px, panel tengah).
- Light mode — tetap di-skip (keputusan 22 Nov).
- Font sistem — tidak ada unduhan font.
- Warna tile/logo per layanan yang dipilih pengguna — token baru
  hanya mengatur chrome aplikasi, bukan konten pilihan pengguna.

## Panel Kelola v2 — baris seragam (usulan v0.6.1)

Layout lama: 8 tombol teks lebar beda-beda membungkus tak rata,
tinggi baris tak konsisten. Layout baru hanya mengganti lapisan
presentasi (markup renderManageList + CSS); semua logika
(pin, nonaktif, duplikat, hapus dua langkah, naik/turun, simpan
edit + ganti URL) tidak berubah.

- **Kerangka panel tetap**: `.picker` lebar maks 620px, tinggi
  dibatasi + daftar scroll internal; header & footer tak ikut
  scroll.
- **Baris = grid slot tetap**: `[ikon 36px] [info 1fr]
  [status 72px rata kanan] [aksi 5×28px]`, padding 10×12,
  tinggi seragam ±56px, gap 12. Nama 13/600 ellipsis; sub-baris
  URL 11 redup ellipsis.
- **Status jadi kolom sendiri**: pil kecil — "Dipin" (aksen
  samar), "Nonaktif" (samar); slot selalu dirender (boleh
  kosong) agar kolom tetap lurus.
- **Aksi = tombol ikon 28×28** di slot tetap kanan: ↑ ↓ ✎ 📌 ⏻
  (pin menyala aksen saat ter-pin; ↑/↓ nonaktif di ujung daftar).
  Bukan tombol teks lagi. Reorder seret (drag handle) BUKAN
  target versi ini.
- **Duplikat & Hapus pindah ke footer form edit**: form
  akordeon tetap melebar penuh di bawah baris; footer form:
  kiri [Ganti ikon] [Duplikat] [Hapus], kanan [Batal] [Simpan].
  Field Nama & URL berdampingan di panel lebar, menumpuk di
  panel sempit (flex-wrap bermeter minimum).
- **Baris pengaturan panel** (saklar nama + ukuran ikon): satu
  baris rapi di bawah header — label kiri, kontrol kanan,
  pemisah hairline.

### Gerbang fit HD–4K (syarat tetap Agung, 23 Nov 2026)

Semua UI Sodium harus utuh dari layar resolusi rendah sampai
4K, scaling Windows 100–200%: tidak ada elemen kepotong/hilang.
Untuk panel ini berarti, by construction:

- Panel tidak pernah lebih tinggi/lebar dari viewport
  (rumus min() yang sudah ada dipertahankan).
- Daftar layanan yang scroll hanya `.manageList`
  (flex:1, min-height:0); header, baris pengaturan, dan footer
  selalu terlihat.
- Tidak ada baris yang meluber horizontal: semua teks ellipsis,
  semua slot berukuran tetap atau menyusut terkendali.
- Matriks cek saat menilai hasil: 1366×768, 1920×1080,
  2560×1440, 3840×2160 (100% & 200%), jendela 900×600 dan
  760×500. Verifikasi konstruksi dari kode oleh Vega; vonis
  akhir tetap tes visual Agung di perangkatnya.
