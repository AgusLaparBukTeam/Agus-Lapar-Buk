# Deployment

Dokumen ini menjelaskan bentuk deployment minimum untuk GateGuard. Dokumen ini bukan pengganti security control pada environment yang menjalankan aplikasi.

## Runtime Topology

Deployment production sebaiknya hanya mengekspos frontend melalui TLS ingress yang terautentikasi.

```text
Internet
  │
  ▼
TLS ingress / WAF / identity provider
  │
  ▼
Next.js
  │ private network
  ▼
FastAPI
  │
  ▼
PostgreSQL
```

Service FastAPI tidak boleh dapat diakses langsung dari Internet.

## Konfigurasi Wajib

Mulai dari `.env.production.example` dan ganti seluruh placeholder. Production minimal memerlukan:

- `APP_PUBLIC_ORIGIN`
- `APP_API_KEY`
- `SESSION_TTL_SECONDS`
- `COOKIE_SECURE=true`
- `POSTGRES_PASSWORD`
- `DATABASE_URL`

`APP_API_KEY` adalah credential server-to-server yang hanya digunakan oleh Next.js BFF. Autentikasi manusia memakai user pada database dan opaque session cookie; tidak ada shared supervisor credential.

Jika ekstraksi OpenAI diaktifkan, `OPENAI_API_KEY` harus tetap berada di sisi server. Jangan pernah mengekspos provider key melalui variabel `NEXT_PUBLIC_*`.

## Database Migration

Terapkan migration sebelum aplikasi menerima traffic:

```bash
cd backend
uv run alembic upgrade head
```

Production Compose yang disediakan menjalankan migration sebagai one-shot service sebelum backend dimulai.

## Container Deployment

```bash
cp .env.production.example .env
# edit .env
docker compose -f docker-compose.prod.yml up --build
```

Container berjalan sebagai non-root user dengan Linux capability yang dibatasi. Byte dokumen upload disimpan pada named volume `gateguard-documents` yang dipakai bersama oleh backend dan worker. Backup serta retensi volume ini harus dikelola bersama PostgreSQL, atau storage boundary perlu diganti dengan object-storage adapter yang disetujui sebelum melakukan scale-out.

## Azure Readiness

Azure belum dikonfigurasi sebagai target deployment pada repository ini. Sebelum melakukan deployment di Azure, tetapkan subscription, region, ownership, environment separation, budget alert, managed identity atau Service Principal dengan least privilege, serta strategi backup dan recovery.

Simpan secret production pada secret manager yang dikelola platform; jangan memasukkannya ke GitHub Actions log, Docker image, repository, atau `NEXT_PUBLIC_*`. Perubahan resource, networking, atau cost-bearing service harus melalui review dan persetujuan terpisah. Pilihan compute, database, storage, ingress, dan observability perlu didokumentasikan dalam runbook target environment sebelum production traffic diarahkan ke Azure.

## Dependency Locking

Versi dependency tingkat atas dibatasi pada `pyproject.toml`, `requirements.txt`, dan `package.json`. Controlled release juga harus menyertakan generated lockfile.

Buat lockfile dari mesin yang memiliki akses ke package registry publik:

```bash
./scripts/generate_locks.sh
```

Review perubahan dependency sebelum merge lockfile yang dihasilkan.

## Ingress dan Authentication

Sebelum mengekspos GateGuard di luar environment development tepercaya:

- terminasi TLS pada managed ingress atau reverse proxy;
- arahkan browser boundary publik ke Next.js BFF;
- jaga FastAPI service credential tetap di server;
- jalankan `alembic upgrade head` sebelum API;
- bootstrap admin pertama dengan `python backend/scripts/create_admin.py`;
- enforce authorization supervisor override melalui backend RBAC;
- tetapkan request-body limit pada ingress dan aplikasi;
- gunakan shared rate limiter saat beberapa backend replica dijalankan;
- simpan FastAPI pada private network;
- batasi CORS ke frontend origin yang sudah dideploy.

## Penanganan Data dan Backup

Dokumen shipment dapat memuat data pelanggan dan data komersial. Tetapkan kebijakan retensi serta akses sebelum memakai dokumen nyata.

Dokumen upload dipersist pada document volume yang dikonfigurasi dan harus tercakup oleh retensi serta backup organisasi. External extraction provider mungkin memiliki ketentuan processing dan retention sendiri; review ketentuan tersebut sebelum provider dipakai untuk data production.

Untuk PostgreSQL, tetapkan dan uji:

- automated backup;
- restore procedure;
- retention policy;
- credential rotation;
- migration rollback dan recovery procedure.

Backup yang belum pernah dipulihkan di test environment tidak boleh dianggap sebagai recovery path yang tervalidasi.

## Health Check

- `/healthz` mengonfirmasi proses API hidup.
- `/readyz` mengonfirmasi service dapat menggunakan repository atau schema yang dikonfigurasi.

Gunakan readiness, bukan liveness, untuk menentukan apakah sebuah replica dapat menerima traffic.
