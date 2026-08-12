# Ringkasan Perbaikan GateGuard

## Hasil Utama

Perbaikan berfokus pada bukti visual ekstraksi, perhitungan dampak finansial, preprocessing gambar, pencarian yang tidak peka huruf besar/kecil, serta pengalaman daftar shipment. Verifikasi sampel `samples/hold-quantity/` menghasilkan status `HOLD`, estimasi selisih **Rp180.000**, dan koordinat bukti yang terisi untuk kuantitas pada Invoice, Packing List, serta Surat Jalan.

| Area | Perubahan yang diterapkan | Dampak demo |
|---|---|---|
| Evidence bounding box | `pdfplumber` mengambil posisi kata PDF, dinormalisasi ke 0..1, lalu dikorelasikan ke `DocumentField.evidence`. PaddleOCR meneruskan box OCR; hasil OpenAI dikorelasikan melalui PDF word boxes atau PaddleOCR bila tersedia. | Mismatch kuantitas memiliki bukti posisi sumber yang dapat dipakai viewer untuk menyoroti nilai berbeda. |
| Estimasi kerugian | Selisih quantity hanya dihitung bila harga positif dan valid; selisih total dokumen juga memperoleh estimasi absolut. `ReconciliationResult` kini mengekspos total agregat. | Nilai bisnis mismatch dapat dijelaskan sebagai nominal potensi kerugian, bukan hanya jumlah unit. |
| Preprocessing | Ditambahkan crop dokumen konservatif, deskew, CLAHE, dan denoise untuk JPEG/PNG sebelum OCR/vision. Artefak preprocessing berbeda dari file asli dan status proses masuk ke respons dokumen. | Menunjukkan tahap computer vision mandiri sebelum pemanggilan AI. |
| Pencarian | Pencarian shipment dan global dibuat `ilike`; dokumen dapat dicari lewat `document_reference`, tipe dokumen, atau nama file versi saat ini. | Query huruf kecil tetap menemukan referensi tersimpan dengan kapitalisasi lain. |
| UI daftar | `/shipments` kini memiliki state halaman, tombol Sebelumnya/Berikutnya, jumlah hasil, dan query React Query yang bergantung pada halaman. `/shipments` dan `/history` memakai `useDeferredValue`. | Data lebih dari 50 shipment dapat diakses dan pencarian tidak memicu request pada setiap ketikan. |

## File Diubah atau Ditambahkan

| Task | File |
|---|---|
| Evidence extraction dan korelasi | `backend/app/services/extraction.py` |
| Preprocessing gambar | `backend/app/services/preprocessing.py` |
| Metadata preprocessing dan total estimasi | `backend/app/domain/models.py` |
| Estimasi quantity/total mismatch | `backend/app/domain/reconciliation.py` |
| Agregat dashboard reconciliation dan pencarian shipment | `backend/app/repositories/reconciliations.py` |
| Global search document reference | `backend/app/repositories/operations.py` |
| Migrasi kolom pencarian | `backend/alembic/versions/0007_document_reference_search.py` |
| Dependensi | `backend/pyproject.toml`, `backend/uv.lock` |
| Verifikasi demo sampel | `backend/scripts/verify_hold_quantity.py` |
| Test baru | `backend/tests/test_evidence_and_preprocessing.py` |
| Pagination dan deferred search shipment | `frontend/app/(console)/shipments/page.tsx` |
| Deferred search riwayat | `frontend/app/(console)/history/page.tsx` |

## Hasil Verifikasi

| Pemeriksaan | Hasil |
|---|---|
| Baseline backend sebelum perubahan | `42 passed, 1 warning` |
| Backend setelah perubahan | `45 passed, 1 warning` |
| Lint pada file backend yang diubah | Lulus (`ruff check ...`) |
| Frontend lint | Lulus (`npm run lint`) |
| Frontend test | `2 passed` |
| Diff whitespace | Lulus (`git diff --check`) |
| Sampel `hold-quantity` | `HOLD`, `estimated_discrepancy_value=180000.0`, bukti kuantitas Invoice/Packing List/Surat Jalan terisi |

> Pengecekan `ruff check .` tingkat-proyek masih melaporkan pelanggaran yang sudah ada pada file lain, misalnya `scripts/seed_users.py`. Pelanggaran pada file yang ditambah atau diubah telah diperbaiki dan lulus lint terarah.

## Langkah Uji Manual di Browser

1. Jalankan backend dengan environment lokal yang sudah dikonfigurasi dan frontend Next.js, kemudian masuk ke workspace.
2. Buat atau buka shipment dan unggah tiga file pada `samples/hold-quantity/`: `invoice.pdf`, `packing-list.pdf`, dan `surat-jalan.pdf`.
3. Jalankan assessment/reconciliation. Pastikan keputusan menjadi **HOLD** dan pilih temuan `QUANTITY_MISMATCH`.
4. Buka panel dokumen untuk Invoice dan Packing List. Evidence mismatch memuat koordinat normalisasi dan harus dipasangkan oleh viewer sebagai highlight pada nilai kuantitas sumber. Verifikasi nilai yang disorot adalah `100` di Invoice dan `90` di Packing List.
5. Konfirmasi nilai nominal pada hasil reconciliation: `estimated_discrepancy_value` harus bernilai `180000`, dengan sumber harga Invoice. Total hasil juga tersedia sebagai `estimated_discrepancy_total`.
6. Buka `/shipments`, ketik query bertahap, dan perhatikan input tetap responsif sedangkan request menunggu nilai deferred. Ubah halaman dengan tombol **Sebelumnya** dan **Berikutnya**.
7. Ulangi pencarian pada `/history`. Pastikan tidak ada request baru untuk setiap karakter ketika pengguna masih mengetik.
8. Untuk global search, gunakan referensi dokumen atau nama file dengan kapitalisasi berbeda; hasil harus tetap ditemukan dalam organisasi yang sama.

## Keputusan Implementasi

Korelasi evidence memakai exact match terlebih dahulu dan fuzzy ratio minimal **88**. Threshold ini mencegah box acak: ketika OCR/PDF tidak menemukan sumber yang cukup mirip, `evidence` dibiarkan kosong. Untuk nilai numerik, pengecekan exact terhadap representasi mentah diprioritaskan sehingga angka `90` dan `100` tidak dipertukarkan.

Preprocessing hanya berjalan untuk JPEG/PNG. File PDF berbasis teks tidak diubah agar evidence `pdfplumber` tetap selaras dengan halaman PDF asli. Gambar hasil preprocessing menjadi artefak ekstraksi tersendiri; file upload asli tidak pernah ditimpa. Estimasi quantity tidak dibuat ketika harga kosong, nol, negatif, atau tidak finite, sehingga `None` tetap membedakan data harga tidak cukup dari kerugian yang benar-benar nol.
