# Quality Review

Dokumen ini menjelaskan standar kualitas GateGuard untuk pengalaman operator, evidence hasil ekstraksi, keputusan rekonsiliasi, keamanan, dan operasional. Dokumen ini bukan pengganti test otomatis atau review pull request; gunakan sebagai baseline untuk menilai perubahan yang menyentuh alur pengiriman.

## Ringkasan Standar

| Domain | Standar yang harus dipenuhi |
|---|---|
| Pengalaman operator | Antarmuka memakai komponen konsisten, label jelas, feedback yang dapat ditindaklanjuti, dan Bahasa Indonesia natural pada area yang dihadapi operator. |
| Lokalisasi | Istilah kerja diterjemahkan bila lebih jelas; nama produk, format file, API, OCR, status keputusan, dan istilah teknis umum tetap dalam English. |
| Evidence | Nilai penting menyertakan provenance dan confidence bila tersedia. Sistem tidak boleh mengarang posisi sumber ketika bukti tidak cukup. |
| AI/OCR | Output model diperlakukan sebagai evidence tidak tepercaya dan tidak dapat menetapkan keputusan release secara mandiri. |
| Rekonsiliasi | Aturan fail-closed mempertahankan perbedaan antara konflik material, variasi yang memerlukan review, dan evidence lengkap yang dapat dibersihkan. |
| Keamanan | Scope organisasi, RBAC backend, audit history, secret boundary, dan validasi input tetap berlaku pada setiap perubahan. |
| Operasional | Deployment memiliki health check, migration discipline, backup, serta runbook yang dapat dipulihkan dan diuji. |

## Kebijakan Bahasa Indonesia

> Terjemahkan maksud kerja yang dihadapi operator. Pertahankan istilah teknis, nama produk, atau label keputusan yang sudah menjadi kebiasaan kerja dan harus stabil dalam audit trail.

| Diterjemahkan | Bentuk yang digunakan | Alasan |
|---|---|---|
| Shipment | Pengiriman | Jelas dalam konteks gudang dan distribusi. |
| Work queue | Antrean kerja | Menjelaskan daftar tindakan yang menunggu dikerjakan. |
| Document checks | Pemeriksaan dokumen | Natural untuk tindakan utama operator. |
| Release decisions | Keputusan pelepasan | Menjelaskan keputusan sebelum barang dikirim. |
| Requirements | Persyaratan | Terminologi umum dan mudah dipahami. |
| Notifications | Notifikasi | Lazim pada aplikasi kerja berbahasa Indonesia. |
| Confidence | Tingkat keyakinan | Menjelaskan skor evidence bagi pengguna nonteknis. |
| Evidence region | Area bukti | Lebih mudah dipahami daripada koordinat teknis. |

| Dipertahankan dalam English | Alasan |
|---|---|
| GateGuard, Invoice, PDF, JPG, PNG | Nama produk, nama dokumen komersial, atau format file. |
| Webhooks, API, OCR, OpenAI, PaddleOCR | Akronim, protokol, atau nama provider. |
| Online | Istilah universal pada produk digital. |
| Observability | Istilah engineering yang umum dipakai tim teknis. |
| Override, `HOLD`, `REVIEW`, `CLEAR` | Label keputusan dan audit yang perlu stabil. |

## UI dan Interaksi

Komponen antarmuka mengikuti sistem Cloudflare/Kumo: canvas netral, surface yang dipisahkan terutama dengan border, primary action yang jarang dan eksplisit, serta kontrol ringkas. Button sekunder adalah default; aksi create, save, submit, dan release yang benar-benar utama harus memilih `primary` secara eksplisit.

Kontrol interaktif menggunakan primitive yang konsisten untuk Checkbox, Select, Dialog, dan DropdownMenu. Popup serta menu harus dapat ditutup dengan click di luar komponennya. Language picker memakai label ringkas `ID` atau `EN`, tanpa bendera atau salinan panjang. Scrollbar harus tipis dan tidak mengganggu konten.

Seluruh route harus memulai halaman dengan identitas yang jelas melalui `PageHeader` atau header operasional yang setara. Empty state, error, dan status loading harus menjelaskan tindakan berikutnya; tampilan kosong tidak boleh menyamarkan kegagalan data sebagai kondisi berhasil.

## Evidence dan AI/OCR

Extractor PDF dapat memakai lokasi kata yang dinormalisasi ke rentang 0..1. Pada gambar, preprocessing seperti crop konservatif, deskew, peningkatan kontras, dan denoise harus memperlakukan file asli sebagai immutable. Evidence dipilih dengan exact match terlebih dahulu; fuzzy match hanya boleh digunakan ketika threshold dan sumber dapat dipertanggungjawabkan. Jika sistem tidak cukup yakin, evidence dibiarkan kosong.

Hasil vision atau language model tidak boleh diminta mengarang koordinat. Nilai terstruktur harus dikorelasikan dengan PDF text atau OCR layer ketika tersedia. Estimasi discrepancy hanya boleh dibuat dari harga yang finite dan positif agar angka bisnis tidak menyesatkan.

## Batas Sistem dan Keamanan

Setiap query data harus tetap scoped oleh `organization_id`. Authorization kritis seperti supervisor override, user management, dan release decision harus diputuskan backend, bukan hanya disembunyikan di frontend. Role `admin` adalah otoritas tertinggi dan tidak dapat ditambahkan melalui UI atau API normal.

Validasi file, batas ukuran, signature, serta batas resource dilakukan sebelum ekstraksi. Jangan memasukkan secret atau raw customer document ke fixture publik, log, screenshot, atau dokumentasi. Lihat [Security policy](../SECURITY.md) dan [Architecture](architecture.md) untuk detail boundary.

## Checklist Review

Sebelum perubahan dianggap siap, reviewer perlu memeriksa hal berikut:

- perilaku baru memiliki test regresi atau evaluasi yang relevan;
- aturan deterministik tidak dilonggarkan hanya agar fixture lolos;
- label dan copy operator menggunakan Bahasa Indonesia yang natural;
- status, error, loading, keyboard focus, serta mobile layout dapat digunakan;
- API contract, authorization, audit trail, dan organization scope tetap utuh;
- lint, test, dan production build yang relevan telah dijalankan;
- perubahan deployment atau Azure dinilai terpisah untuk secret, jaringan, backup, dan potensi biaya.
