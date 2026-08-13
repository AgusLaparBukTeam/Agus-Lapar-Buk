# Change Summary

Dokumen ini merangkum kemampuan utama GateGuard yang diperkuat melalui iterasi engineering pada evidence extraction, rekonsiliasi, pengalaman daftar operasional, dan antarmuka. Gunakan dokumen ini sebagai konteks perubahan tingkat produk; source code, migration, test, dan release note pull request tetap menjadi sumber teknis yang lebih rinci.

## Kapabilitas Utama

| Area | Implementasi | Nilai Operasional |
|---|---|---|
| Evidence bounding box | `pdfplumber` mengambil posisi kata PDF yang dinormalisasi, PaddleOCR meneruskan OCR box, dan evidence dikorelasikan ke `DocumentField.evidence`. | Operator dapat meninjau lokasi nilai sumber yang memicu mismatch. |
| Estimasi discrepancy | Selisih quantity dihitung hanya ketika harga positif dan valid; hasil rekonsiliasi mengekspos agregat estimasi. | Dampak mismatch dapat dijelaskan sebagai paparan nominal, bukan hanya perbedaan unit. |
| Image preprocessing | JPEG/PNG dapat melewati crop konservatif, deskew, CLAHE, dan denoise sebelum OCR atau vision. | Kualitas input dapat ditingkatkan tanpa mengubah file upload asli. |
| Pencarian operasional | Shipment dan global search mendukung pencocokan yang tidak peka huruf besar atau kecil, document reference, dan nama file. | Operator lebih cepat menemukan record yang relevan. |
| Register skala besar | Daftar shipment mendukung pagination dan deferred search. | Respons input tetap stabil ketika volume data bertambah. |
| Cloudflare/Kumo UI | Token semantik, shell, form control, dialog, menu, status badge, dan route register memakai pola antarmuka yang konsisten. | Pengalaman aplikasi lebih koheren, ringkas, dan dapat diakses. |

## Komponen Teknis Terkait

| Kapabilitas | Lokasi utama |
|---|---|
| Evidence extraction dan korelasi | `backend/app/services/extraction.py` |
| Image preprocessing | `backend/app/services/preprocessing.py` |
| Metadata preprocessing dan estimasi | `backend/app/domain/models.py`, `backend/app/domain/reconciliation.py` |
| Pencarian dan agregasi data | `backend/app/repositories/reconciliations.py`, `backend/app/repositories/operations.py` |
| Migration pencarian dokumen | `backend/alembic/versions/0007_document_reference_search.py` |
| Fixture dan verifikasi rekonsiliasi | `backend/scripts/verify_hold_quantity.py`, `backend/tests/test_evidence_and_preprocessing.py` |
| Register shipment dan history | `frontend/app/(console)/shipments/page.tsx`, `frontend/app/(console)/history/page.tsx` |
| Sistem visual aplikasi | `frontend/app/globals.css`, `frontend/components/app-shell/`, `frontend/components/ui/` |

## Keputusan Implementasi

Korelasi evidence memakai exact match terlebih dahulu. Fuzzy match hanya digunakan dengan threshold yang konservatif; jika OCR atau PDF tidak menyediakan sumber yang cukup mirip, field evidence dibiarkan kosong. Untuk nilai numerik, representasi mentah diprioritaskan agar nilai yang tampak serupa tetapi berbeda tidak tertukar.

Preprocessing berlaku bagi JPEG/PNG. PDF berbasis teks tidak dimodifikasi agar evidence dari `pdfplumber` tetap sejajar dengan halaman sumber. Artefak preprocessing disimpan sebagai hasil ekstraksi terpisah; file upload asli tidak pernah ditimpa.

Estimasi quantity tidak dibuat ketika harga kosong, nol, negatif, atau tidak finite. Dengan demikian, `None` tetap membedakan data harga yang tidak cukup dari kerugian yang benar-benar bernilai nol.

## Skenario Verifikasi Manual

1. Jalankan backend dan frontend pada environment lokal yang dikonfigurasi, lalu masuk ke workspace.
2. Buat atau buka shipment dan unggah `invoice.pdf`, `packing-list.pdf`, serta `surat-jalan.pdf` dari `samples/hold-quantity/`.
3. Jalankan assessment dan pilih temuan `QUANTITY_MISMATCH`. Keputusan harus menjadi `HOLD`.
4. Buka panel dokumen untuk Invoice serta Packing List dan pastikan viewer menyoroti evidence yang sesuai dengan nilai sumber.
5. Pastikan `estimated_discrepancy_value` hanya muncul ketika sumber harga valid tersedia.
6. Uji pencarian bertahap, perubahan halaman shipment, history search, dan document reference search dengan kapitalisasi yang berbeda.
7. Jalankan lint, test, dan production build yang relevan sebelum pull request dibuka.

## Referensi

- [Quality review](quality-review.md)
- [Architecture](architecture.md)
- [Deployment guide](deployment.md)
- [Contributing guide](../CONTRIBUTING.md)
