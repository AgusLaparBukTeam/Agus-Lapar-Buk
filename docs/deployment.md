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

## Azure Production VM

GateGuard saat ini dijalankan pada satu Azure VM x86_64 (`linux/amd64`) di Indonesia Central. Konfigurasi ini menggunakan satu OS disk Standard LRS 32 GiB, satu static public IPv4, VNet/subnet/NSG minimum, dan swap 2 GiB. PostgreSQL, FastAPI, worker, serta Next.js tetap berada dalam satu `docker-compose.prod.yml`; tidak ada managed database, load balancer, NAT gateway, Log Analytics, atau service pendukung berbayar lain pada topology ini.

Konfigurasi tersebut dipilih agar biaya tetap berada di bawah batas operasional $20 per bulan. Budget atau alert biaya harus dipantau melalui Azure Cost Management, tetapi alert hanya memberi notifikasi dan tidak menghentikan penggunaan secara otomatis. Jangan menambah disk, public IP, backup vault, managed database, atau service observability tanpa menilai kembali dampak biayanya.

VM mengekspos port `80` dan `443` untuk Caddy, serta port `22` dan `2222` untuk deployment administratif berbasis SSH key. FastAPI dan PostgreSQL tidak diekspos langsung. Caddy meneruskan traffic ke frontend pada loopback dan menerbitkan sertifikat TLS otomatis untuk `https://48.193.45.40.sslip.io`, sehingga pengguna dapat mengakses GateGuard dari jaringan publik melalui HTTPS. `APP_PUBLIC_ORIGIN` harus memakai URL HTTPS tersebut. Domain `sslip.io` ini bersifat praktis untuk bootstrap dan pengujian; sebelum penggunaan produksi jangka panjang, gunakan domain milik organisasi yang dikendalikan sendiri dan perbarui konfigurasi Caddy serta `APP_PUBLIC_ORIGIN` secara bersamaan.

Secret production berada pada `/opt/gateguard/.env` dengan permission ketat dan tidak boleh dimasukkan ke Git, Docker image, log CI, atau `NEXT_PUBLIC_*`. Service Principal Azure untuk otomasi tidak digunakan sebagai credential aplikasi.

### Automatic Deployment

Setiap push atau merge ke `main` menjalankan workflow CI. Setelah job `Verify` sukses, job `Publish production images` membangun image `linux/amd64` di runner GitHub dan menerbitkan tag immutable SHA ke GitHub Container Registry (GHCR). VM tetap menjalankan `gateguard-deploy.timer` setiap lima menit, tetapi tugasnya hanya menarik tag SHA yang telah dipublikasikan lalu melakukan restart Compose dengan `--no-build`. Dengan demikian, compile Next.js dan type-check tidak lagi membebani VM 1 GiB.

Package `gateguard-backend` dan `gateguard-frontend` saat ini private. Akun service VM `gateguardadmin` menyimpan autentikasi GHCR yang dibatasi pada token classic `read:packages` di `~/.docker/config.json` dengan permission `0600`; token tidak boleh dimasukkan ke Git, image, `.env`, log CI, atau UI aplikasi. Tag `latest` hanya untuk inspeksi; VM selalu memakai tag SHA immutable yang sama dengan commit `main`. Rotasi token dilakukan sebelum masa berlaku habis dengan `docker logout ghcr.io` dan `docker login ghcr.io`, lalu token lama dicabut di GitHub.

Aktivasi awal setelah pull request pipeline di-merge dilakukan dari VM oleh administrator:

```bash
sudo install -m 0755 /opt/gateguard/infra/gateguard-deploy-if-new.sh /usr/local/sbin/gateguard-deploy-if-new
sudo systemctl start gateguard-deploy.service
```

Jika image untuk SHA belum tersedia, pull akan gagal tanpa menghentikan container lama. Timer akan mencoba kembali pada interval berikutnya. Fallback build lokal hanya boleh dipakai saat recovery eksplisit dengan `sudo GATEGUARD_DEPLOY_MODE=build /usr/local/sbin/gateguard-deploy-if-new`; mode normal adalah `images`.

```bash
sudo systemctl status gateguard-deploy.timer
sudo journalctl -u gateguard-deploy.service -n 100 --no-pager
cat /var/lib/gateguard/last-successful-sha
```

Service memakai lock untuk mencegah deployment tumpang tindih, menunggu health PostgreSQL serta backend, dan menguji `/login` sebelum menyimpan SHA baru sebagai sukses. Jalur ini tidak membutuhkan secret aplikasi di GitHub, tidak menambah resource Azure, dan hanya menggunakan credential package read-only pada VM untuk menarik image private.

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
