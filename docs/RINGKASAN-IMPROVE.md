# Ringkasan Improve Sodium (hasil audit anti-slop, 3 ronde, 22 Nov 2026)

Total 23 butir. **Disetujui Agung 22 Nov 2026: SEMUANYA, dikerjakan bertahap
sesuai prioritas setelah rilis v0.2.5.** Batch 1 = v0.2.6 (prioritas tinggi),
batch 2 = v0.2.7 (prioritas sedang), batch 3 = v0.2.8 (kosmetik).
Detail per temuan ada di UI-AUDIT-2026-11-22.md.

## Prioritas tinggi (fungsi dan akses)

- **16. Toast unduhan tertutup webview layanan** (bug di v0.2.5): pindahkan
  toast jadi pil di strip bar atas.
- **2. Panel tidak bisa ditutup Escape + menu konteks hanya klik kanan**:
  tambah Escape dan jalan keyboard ke Pin/Nonaktifkan/Hapus.
- **17. Hapus layanan tanpa konfirmasi**: tambah langkah "Yakin hapus?".
- **18. Startup tidak memulihkan layanan terakhir**: buka otomatis layanan
  yang terakhir aktif.
- **20. Tanpa penjaga instance tunggal**: jalan kedua fokuskan jendela yang
  sudah ada, cegah rebutan folder profil.

## Prioritas sedang (state dan konsistensi)

- **1. Em dash di 3 teks UI** (welcome, tooltip nonaktif, judul panel ikon):
  ganti koma/titik dua. README pola sama, di luar daftar ini.
- **3. Label formulir**: input cari picker dan field custom hanya placeholder;
  tombol ikon-saja (+, ✕) tanpa aria-label.
- **4. Pencarian picker tanpa hasil**: grid kosong, tambah teks penjelasan.
- **10. Tombol panel/picker tanpa hover/active**; kursor disabled salah.
- **11. Fokus panel**: tanpa gaya :focus-visible khusus; fokus tidak pindah
  ke panel saat dibuka dan tidak kembali saat ditutup.
- **12. Shortcut Ctrl+1..9 mati saat layanan fokus**: keterbatasan arsitektur
  webview; minimal jelaskan, atau cari jalan global.
- **13. Pesan error gagal membuka layanan** tampil abu polos seperti teks
  biasa: beri gaya error yang menonjol.
- **19. Ukuran/posisi jendela tidak diingat**: selalu 1280x800 tiap jalan.
- **21. Panel tidak menutup saat klik di luar.**
- **23. "Hidup bareng" tidak langsung berlaku**: eviction baru jalan saat
  pindah layanan berikutnya.

## Kosmetik dan detail

- **5. Glyph 📌 dobel arti** (Pinterest dan penanda pin); palet ikon berisi
  ⭐/🚀 generik.
- **22. Ikon katalog kurang akurat**: Messenger ⚡ generik, X masih 🐦.
  Ganti huruf pada tile warna brand.
- **15. Ikon aplikasi**: font Arial generik, posisi hardcode tanpa centering
  terukur, sudut tile siku vs ikon UI membulat 14px, belum diuji 16px.
  Warna #f5c518 sudah benar.
- **14. Detail kecil**: teks 9-11px (badge, label Hidup bareng, penanda pin),
  scrollbar bawaan Windows belum setema, nama layanan panjang belum ellipsis.
- **8. Motif identitas di welcome screen** (opsional): tile "Na" kecil;
  sidebar tetap bersih sesuai keputusan v0.2.1.
- **9. Radius tombol + sidebar lingkaran penuh** di tengah sistem 8px:
  catatan ringan, tidak wajib.
- **6. Light mode**: **di-skip atas keputusan Agung 22 Nov**; audit ditutup
  di sini (22 dari 23 temuan selesai, nomor 6 gugur). Jangan ditawarkan
  lagi kecuali Agung yang minta.

## Fitur baru: badge unread (disetujui Agung 22 Nov, jadi v0.2.8)

Diminta Agung 22 Nov ("gw kesulitan tau chat yang belum dibaca dari 1
layanan berapa"): angka chat belum dibaca tampil sebagai badge di ikon
sidebar. Disisipkan setelah batch 2 (v0.2.7), sebelum batch kosmetik
(yang geser jadi v0.2.9). Cara kerja: Sodium memantau judul halaman tiap
webview layanan (on_document_title_changed) dan mengambil angka dari
pola "(n)" di awal judul (WhatsApp, Telegram, Messenger, Discord) plus
pola "Inbox (n)" untuk Gmail; di atas 99 tampil "99+". Layanan yang
judulnya tidak memuat angka tidak menampilkan badge (tidak dikarang).
Badge hanya akurat selama webview layanan hidup; webview yang
dimusnahkan (batas Hidup bareng) badge-nya dibersihkan, bukan angka
basi. Penanda pin pindah ke titik kuning kecil di kiri atas ikon supaya
tidak tabrakan dengan badge di kanan atas (nyambung temuan 5).

System tray: tetap menunggu permintaan Agung.

Extension adblock bawaan + toggle DNS aman ala Chrome: dibahas 22 Nov,
**di-skip atas keputusan Agung**. Alasan teknis: Tauri tidak mengekspos
API extension WebView2 (jalan satu-satunya ngoprek COM, rapuh), dan
WebView2 tidak punya saklar DoH; privasi DNS diurus di level Windows.
