# GateGuard

GateGuard adalah workspace assurance pengiriman untuk memeriksa konsistensi dokumen sebelum barang dilepas. Aplikasi menyatukan case pengiriman, dokumen sumber, pemeriksaan, exception, approval, dan keputusan release ke dalam satu rekam operasional yang dapat ditelusuri.

> **Prinsip utama:** ekstraksi dokumen dapat bersifat probabilistik, sedangkan keputusan `CLEAR`, `REVIEW`, dan `HOLD` harus deterministik, dapat diaudit, dan fail-closed.

## Ringkasan

| Area | Peran |
|---|---|
| Operations console | Antarmuka Next.js untuk mengelola case, dokumen, pemeriksaan, exception, release, dan pengaturan workspace. |
| Backend API | Modular monolith FastAPI yang menangani autentikasi, RBAC, audit, lifecycle shipment, rekonsiliasi, serta integrasi. |
| Evidence pipeline | Mengubah dokumen menjadi evidence terstruktur dengan provenance dan confidence. |
| Decision engine | Membandingkan field penting secara deterministik dan menghasilkan keputusan operasional. |
| Data layer | PostgreSQL untuk production dan SQLite untuk pengembangan atau test lokal. |

## Arsitektur

```text
Browser
  -> Next.js operations console + BFF
  -> FastAPI modular monolith
       organizations / facilities / memberships
       auth / sessions / RBAC / audit / four-eyes approval
       shipment lifecycle / work queue / document vault
       assurance checks / exceptions / rule packs / screening records
       integrations / service tokens / webhooks / processing jobs
       analytics / observability / deterministic domain rules
  -> PostgreSQL pada production, SQLite untuk local development dan test
```

Browser tidak menerima service key backend, kredensial provider, password database, atau session token melalui JavaScript. BFF meneruskan cookie sesi HttpOnly dan menyimpan credential antar-layanan di sisi server.

Dokumentasi desain dan operasi yang lebih rinci tersedia pada [Documentation index](docs/index.md).

## Ruang Kerja Operasional

| Route | Kegunaan |
|---|---|
| `/dashboard` | Ringkasan shipment aktif, exception, pekerjaan terlambat, kesiapan release, dan record terakhir. |
| `/shipments` | Register shipment serta rekam operasional bertab. |
| `/documents`, `/parties`, `/products`, `/transport` | Register evidence, pihak terkait, produk, dan pergerakan. |
| `/requirements`, `/assurance`, `/exceptions`, `/screening`, `/dangerous-goods` | Alur assurance dan pemeriksaan kepatuhan. |
| `/work-queue`, `/releases`, `/analytics`, `/observability`, `/audit` | Pengambilan keputusan, beban kerja, tren, observability, serta traceability. |
| `/integrations/*`, `/governance/*`, `/settings/*` | Konfigurasi koneksi, rule pack, reference data, user, policy, keamanan, dan retensi. |

Role aplikasi adalah `operator`, `supervisor`, dan `admin`. Backend melakukan enforcement atas permission; menyembunyikan kontrol pada frontend bukanlah batas keamanan.

## Menjalankan Secara Lokal

Prasyarat utama adalah Python, Node.js, package manager yang sesuai dengan lockfile, serta Docker apabila menggunakan Compose. Salin environment example dan jalankan service:

```bash
cp .env.example .env
docker compose up --build
```

Untuk menjalankan service secara terpisah:

```bash
cd backend
uv sync --locked --extra dev
uv run alembic upgrade head
uv run python scripts/create_admin.py
uv run uvicorn app.main:app --reload --port 8000

cd ../frontend
npm ci --include=dev
npm run dev
```

Admin pertama dibuat secara interaktif. Password tidak boleh di-commit, ditulis ke log, atau disimpan pada variabel `NEXT_PUBLIC_*`.

## Validasi

Jalankan pemeriksaan relevan sebelum membuka pull request:

```bash
make test

cd frontend
npm run lint
npm run build
```

Untuk perubahan pada rekonsiliasi, jalankan evaluasi tambahan:

```bash
cd backend
uv run python ../evaluation/run.py
```

## Keamanan dan Data

Production memerlukan PostgreSQL, `APP_API_KEY` dengan panjang minimal 32 karakter, `CORS_ORIGINS` eksplisit tanpa wildcard, serta cookie aman. `APP_API_KEY` hanya dipakai BFF sebagai credential server-to-server. Jika ekstraksi OpenAI diaktifkan, `OPENAI_API_KEY` juga harus tetap berada di sisi server.

Document vault menyimpan byte PDF/JPEG/PNG di storage yang dibatasi scope organisasi, merekam hash SHA-256 dan versi yang immutable, serta dapat menandai hasil sebagai `NEEDS_REVIEW` ketika provider tidak dikonfigurasi. GateGuard memeriksa konsistensi lintas dokumen dan evidence alur kerja; aplikasi ini tidak membuktikan isi fisik barang atau menggantikan referensi WMS/ERP yang otoritatif.

## Kontribusi dan Dukungan

Baca [Contributing guide](CONTRIBUTING.md) sebelum mengajukan perubahan dan [Security policy](SECURITY.md) sebelum melaporkan isu keamanan. Panduan deployment tersedia di [Deployment guide](docs/deployment.md).
