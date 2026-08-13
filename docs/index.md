# Documentation Index

Dokumentasi GateGuard disusun dengan nama file berbahasa Inggris agar path repository konsisten. Isi dokumen menggunakan Bahasa Indonesia untuk memudahkan pemahaman tim operasional dan engineering, sambil mempertahankan command, path, API, status, serta istilah teknis yang memang lebih tepat dalam English.

| Dokumen | Tujuan |
|---|---|
| [README](../README.md) | Gambaran produk, arsitektur singkat, setup lokal, validasi, dan batas sistem. |
| [Architecture](architecture.md) | Alur request, trust boundary, semantik `CLEAR`/`REVIEW`/`HOLD`, persistensi, dan non-goal. |
| [Quality Review](quality-review.md) | Standar UI, lokalisasi, evidence, AI/OCR, keamanan, serta checklist review. |
| [Change Summary](change-summary.md) | Ringkasan kapabilitas penting, komponen teknis, keputusan implementasi, dan skenario verifikasi. |
| [Deployment](deployment.md) | Topologi production, konfigurasi, migration, container, readiness Azure, ingress, backup, serta health check. |
| [Production Readiness](production-readiness.md) | Quality gate rilis: UI, backend, keamanan, AI/OCR, metadata, deployment, dan rollback. |
| [Contributing](../CONTRIBUTING.md) | Prinsip kontribusi, setup dependency, validasi, dan standar pull request. |
| [Security Policy](../SECURITY.md) | Pelaporan kerentanan, area sensitif, dan batas keamanan aplikasi. |

## Dokumentasi Baru atau Perubahan Signifikan

Saat menambah capability yang mengubah kontrak API, keputusan rekonsiliasi, trust boundary, deployment, atau biaya cloud, perbarui dokumen yang relevan pada pull request yang sama. Hindari menyimpan credential, data pelanggan, log production, atau screenshot yang mengandung informasi sensitif di dokumentasi.

Untuk deployment Azure, dokumentasikan subscription target, environment, ownership, role assignment, network boundary, secret store, backup, disaster recovery, observability, serta prosedur rollback sebelum traffic production dialihkan.
