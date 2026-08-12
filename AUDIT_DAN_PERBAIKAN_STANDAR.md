# Audit Mendalam dan Perbaikan Standar GateGuard

## Ringkasan Eksekutif

Audit ulang difokuskan pada pengalaman operator gudang, kualitas antarmuka, lokalisasi, reliabilitas ekstraksi AI/OCR, keamanan data organisasi, dan verifikasi rilis. Prioritas tertinggi adalah membuat proses pemeriksaan dokumen dapat dijelaskan saat demo: sistem harus menunjukkan sumber nilai, menghitung paparan finansial secara defensif, menghindari keputusan dari data yang lemah, dan memberi antarmuka Bahasa Indonesia yang natural. Perbaikan telah memperkuat evidence bounding box, preprocessing gambar, guardrail estimasi finansial, pencarian case-insensitive, pagination, serta lokalisasi shell dan alur pemeriksaan dokumen. Semua perubahan diuji tanpa melemahkan test sebelumnya.

| Domain | Risiko yang ditemukan | Perbaikan yang diterapkan | Status |
|---|---|---|---|
| UI operator | Navigasi dan alur pemeriksaan bercampur Bahasa Inggris/Indonesia; tidak ada pilihan bahasa. | Menambahkan pemilih bahasa persisten `Bahasa Indonesia`/`English`, lokalisasi navigasi, pencarian, breadcrumb, dan alur unggah pemeriksaan. | Selesai untuk shell dan alur inti. |
| Bahasa produk | Terjemahan literal berisiko terasa asing bagi operator. | Menetapkan kebijakan istilah dan test regresi untuk istilah yang harus tetap English. | Selesai. |
| Bukti AI/OCR | Field hasil ekstraksi dapat tidak memiliki bukti posisi sumber. | Menambahkan word box PDF, propagasi box OCR, korelasi OpenAI, dan guardrail fuzzy match. | Selesai. |
| Kualitas input gambar | Foto dokumen miring/berkontras rendah dikirim apa adanya ke extractor. | Menambahkan crop konservatif, deskew, CLAHE, dan denoise sebagai artefak terpisah. | Selesai. |
| Dampak bisnis | Estimasi mismatch dapat salah bila harga nol/invalid atau tidak tersedia. | Membatasi estimasi ke harga finite dan positif; menghitung selisih total sebagai nilai absolut. | Selesai. |
| Pencarian dan skala daftar | Pencarian peka kapitalisasi dan daftar shipment terbatas ke halaman pertama. | Menggunakan `ilike`, document reference search, deferred search, dan pagination. | Selesai. |

## Kebijakan Bahasa Indonesia

> Prinsipnya: **terjemahkan maksud kerja yang dihadapi operator, pertahankan istilah teknis atau nama produk yang sudah menjadi kebiasaan kerja.**

| Diterjemahkan | Bentuk yang digunakan | Alasan |
|---|---|---|
| Shipment | Pengiriman | Paling jelas dalam konteks gudang dan distribusi. |
| Work queue | Antrean kerja | Menggambarkan daftar tugas yang menunggu tindakan. |
| Document checks | Pemeriksaan dokumen | Natural untuk tindakan utama operator. |
| Release decisions | Keputusan pelepasan | Menjelaskan keputusan sebelum barang dikirim. |
| Requirements | Persyaratan | Terminologi umum dan mudah dipahami. |
| Notifications | Notifikasi | Sudah sangat lazim pada aplikasi kerja Indonesia. |
| Confidence | Tingkat keyakinan | Memperjelas makna skor model bagi pengguna nonteknis. |
| Evidence region | Area bukti | Lebih mudah dipahami daripada istilah koordinat teknis. |

| Dipertahankan dalam English | Alasan |
|---|---|
| GateGuard, Invoice, PDF, JPG, PNG | Nama produk, nama dokumen komersial, atau format file. |
| Webhooks, API, OCR, OpenAI, PaddleOCR | Akronim/protokol/nama provider; terjemahan literal menurunkan keterbacaan. |
| Online | Istilah universal dalam produk digital; tidak diganti menjadi “Dalam jaringan”. |
| Observability | Istilah disiplin engineering yang lebih familiar dalam bentuk English pada audiens teknis. |
| Override, HOLD, REVIEW, CLEAR | Label keputusan/audit penting yang konsisten dengan rule engine dan rekam jejak sistem. |

Pilihan bahasa disimpan di `localStorage` sebagai `gateguard.language` dan menggunakan event internal agar shell serta alur pemeriksaan merender ulang tanpa reload. Bahasa default adalah **Bahasa Indonesia**, sementara English tetap tersedia sebagai fallback eksplisit.

## Perbaikan yang Diterapkan

### Antarmuka dan Pengalaman Pengguna

1. `frontend/lib/locale.ts` menjadi sumber kebenaran bahasa, termasuk fallback English dan daftar istilah yang telah dikurasi.
2. `frontend/components/app-shell/app-shell.tsx` sekarang memiliki selector bahasa, navigasi terlokalisasi, command search terlokalisasi, label aksesibilitas, dan bahasa dokumen HTML yang mengikuti pilihan pengguna.
3. `frontend/components/reconciliation/upload-workspace.tsx` menggunakan copy dinamis untuk proses unggah/cek dokumen, termasuk state proses sehingga operator mengetahui apa yang terjadi.
4. `frontend/components/reconciliation/result-workspace.tsx` mengganti istilah campuran yang tidak natural: `Confidence` menjadi **Tingkat keyakinan**, `Provenance` menjadi **Sumber bukti**, serta `region` menjadi **area bukti**.
5. Halaman shipment dan history menggunakan pencarian tertunda, sementara daftar shipment dapat dipaginasi.

### Sistem, AI, dan ML

1. Extractor PDF menggunakan `pdfplumber` untuk mendapatkan lokasi kata yang ternormalisasi ke rentang 0..1. Bukti dipilih exact match lebih dahulu, lalu fuzzy matching minimum 88; bila tidak yakin, box dibiarkan kosong.
2. Pipeline gambar memiliki preprocessing mandiri sebelum OCR/vision: crop konservatif, deskew, peningkatan kontras CLAHE, dan denoise ringan. Upload asli tetap tidak berubah.
3. Hasil vision OpenAI tidak diminta mengarang koordinat. Sistem mengorelasikan nilai terstruktur dengan layer PDF text atau PaddleOCR saat tersedia.
4. Mismatch kuantitas tidak menghasilkan estimasi bila harga tidak finite, nol, negatif, atau kosong. Ini mencegah angka rupiah yang menyesatkan.
5. Query organisasi tetap dipisahkan oleh `organization_id`; perubahan pencarian hanya memperluas pencocokan dalam scope organisasi yang sama.

## Validasi

| Pemeriksaan | Hasil |
|---|---|
| Backend test suite | `45 passed, 1 warning` |
| Lint file backend yang diubah | Lulus |
| Frontend lint | Lulus |
| Frontend test suite | `5 passed` |
| Frontend production build | Lulus; 55 route digenerate/terverifikasi |
| `git diff --check` | Lulus |
| Sampel `hold-quantity` | `HOLD`, estimasi `180000.0`, evidence kuantitas terisi untuk ketiga dokumen |

## Rekomendasi Lanjutan

Lokalisasi telah matang di titik sentuh operator dan shell aplikasi. Untuk menyelesaikan cakupan seluruh produk, migrasikan halaman administratif yang tersisa secara bertahap ke key di `frontend/lib/locale.ts`, bukan hard-coded strings. Urutkan berdasarkan halaman dengan penggunaan tertinggi: dashboard, work queue, shipment detail, exceptions, lalu konfigurasi. Jangan menerjemahkan payload audit, kode status, nama provider, nama file, atau data sumber dokumen karena hal itu harus stabil untuk investigasi.

Sebelum rilis produksi, jalankan migrasi `0007_document_reference_search`, lakukan pengujian end-to-end dengan akun tiap role, dan lakukan pemeriksaan visual browser pada desktop serta mobile. Tidak ada perubahan yang telah di-push; semuanya masih berada di working tree lokal untuk direview terlebih dahulu.
