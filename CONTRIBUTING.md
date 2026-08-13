# Contributing

Terima kasih telah berkontribusi pada GateGuard. Perubahan harus cukup kecil untuk direview, diuji, dan—untuk alur yang dapat memengaruhi keputusan shipment—ditelusuri kembali melalui test regresi atau evidence yang relevan.

## Prinsip Kontribusi

Gunakan perubahan yang terfokus. Hindari mencampur refactor, perubahan dependency, dan perubahan perilaku yang tidak berkaitan dalam satu pull request. Setiap perubahan yang dapat memengaruhi keputusan `CLEAR`, `REVIEW`, `HOLD`, extraction confidence, atau audit trail wajib menjelaskan dampaknya dan menyertakan verifikasi yang sesuai.

## Setup

Siapkan dependency backend dan frontend dari lockfile yang tersedia.

```bash
cd backend
uv sync --locked --extra dev

cd ../frontend
npm ci --include=dev
```

## Validasi Sebelum Pull Request

Jalankan pemeriksaan yang relevan sebelum membuka pull request:

```bash
make test
```

Untuk perubahan pada rekonsiliasi dokumen, jalankan evaluasi tambahan berikut:

```bash
cd backend
uv run python ../evaluation/run.py
```

Tambahkan `npm run lint` dan `npm run build` dari direktori `frontend` apabila perubahan menyentuh antarmuka atau route Next.js. Jangan menganggap build yang berhasil sebagai pengganti test perilaku aplikasi.

## Pull Request

Deskripsi pull request yang baik menjelaskan alasan perubahan dan cara hasilnya diverifikasi. Sertakan informasi berikut dalam bentuk yang singkat dan spesifik:

1. Perilaku yang berubah.
2. Alasan perubahan diperlukan.
3. Cara verifikasi yang telah dijalankan, termasuk command atau test penting.
4. Dampak terhadap `CLEAR`, `REVIEW`, `HOLD`, extraction confidence, audit behavior, atau API contract bila ada.
5. Kebutuhan migrasi, environment variable, atau langkah deployment bila ada.

Gunakan judul yang mendeskripsikan hasil, bukan aktivitas umum. Contohnya, gunakan `fix: retain evidence provenance for numeric mismatches`, bukan `fix bugs`.

## Aturan Rekonsiliasi

Jangan melonggarkan aturan fail-closed hanya agar fixture atau test lolos. Jika variasi dokumen baru seharusnya diterima, tambahkan fixture yang representatif dan jelaskan alasan aman untuk membedakannya dari mismatch yang material.

Evidence dari OCR, model bahasa, atau provider eksternal harus diperlakukan sebagai data tidak tepercaya. Keputusan release tetap berada pada aturan rekonsiliasi deterministik dan batas authorization backend.

## Kualitas Dokumentasi

Nama file dokumentasi menggunakan Bahasa Inggris agar struktur repository konsisten. Isi dokumentasi ditulis dalam Bahasa Indonesia yang jelas, kecuali command, path, kode, nama produk, API, label status, atau istilah teknis yang lebih tepat dipertahankan dalam English.
