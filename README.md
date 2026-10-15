# Form Pendaftaran Calon TNI AD TA 2027 — V1

## Isi paket
- `index.html` — form operator bertahap, lima langkah.
- `styles.css` — tampilan mobile-first navy, putih, aksen emas.
- `app.js` — interaksi langkah, validasi browser, field kondisional, ringkasan, submit.
- `Code.gs` — backend Google Apps Script, validasi NIK/KK, ID dan nomor pendaftaran, simpan ke sheet yang ada.

## Menghubungkan ke Google Spreadsheet
1. Buka spreadsheet `Struktur_Spreadsheet_Calon_TNI_AD_TA2027_V1`.
2. Buka **Extensions → Apps Script**.
3. Salin isi `Code.gs` ke proyek Apps Script.
4. Di **Project Settings → Script Properties**, tambahkan `SPREADSHEET_ID` dengan ID spreadsheet (bagian di antara `/d/` dan `/edit` pada URL).
5. Pastikan nama sheet dan header sama persis dengan struktur spreadsheet.
6. Deploy sebagai **Web app** dengan akses dibatasi pada operator/organisasi yang berwenang. Jangan gunakan data nyata sebelum pengaturan akses diuji.

## Menghubungkan frontend
1. Host `index.html`, `styles.css`, dan `app.js` pada hosting HTTPS yang dipilih.
2. Di bagian atas `app.js`, isi `API_URL` dengan URL `/exec` Web App Apps Script.
3. Karena frontend dan Apps Script beda origin, lakukan uji browser. Jika fetch diblokir oleh CORS, gunakan frontend dan deployment yang dikonfigurasi sesuai kebijakan organisasi; jangan menonaktifkan kontrol keamanan untuk mengakalinya.

## Referensi dropdown
Frontend mengambil opsi dari sheet `REFERENSI` dengan kolom:
`KATEGORI`, `KODE_OPSI`, `LABEL_OPSI`, `AKTIF`, `URUTAN`, `CATATAN`.

`JENIS_PENDAFTARAN` dan `KRITERIA_PRESTASI_NASIONAL` memiliki fallback awal CABA/CATA dan Kriteria 1–3. Pilihan lain sengaja tidak direka-reka. Lengkapi `AGAMA`, `PEKERJAAN`, `PENDIDIKAN_UMUM`, `JURUSAN`, `SUKU`, dan `TINGGAL_BERSAMA` menggunakan opsi resmi/sumber yang disetujui.

## Penting sebelum produksi
- V1 merupakan starter yang perlu diuji; belum ada login/session operator yang terverifikasi. Batasi akses deployment dan hosting.
- NIK/KK disimpan sebagai teks. Nomor BPJS belum dapat dianggap aktif hanya dari format/keberadaan nomor.
- Mapping 36 nilai rapor masih perlu dicocokkan ke urutan kolom ADUE/blanko rapor sebelum impor massal.
- Nomor pendaftaran saat ini dibuat dengan format sementara `TNIAD-2027-00001`; pastikan format ini disetujui.
- Header spreadsheet bersifat case-sensitive dalam proses pemetaan. Jangan mengganti nama header tanpa memperbarui backend.
- Jangan simpan data calon asli pada deployment demo publik. Uji terlebih dahulu dengan data dummy.

## Data yang disimpan
- `CALON`: data identitas, keluarga, alamat, sekolah, kontak dan Babinsa.
- `PENDAFTARAN`: jenis, Kodim, nomor pendaftaran, motivasi, prestasi, status validasi.
- `NILAI_RAPORT`: baris nilai per kelas/semester/mapel.
- `LOG_AKTIVITAS`: log tindakan simpan.
