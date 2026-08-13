# Production Readiness

Dokumen ini adalah quality gate rilis GateGuard. Tujuannya bukan menyatakan aplikasi aman hanya karena build berhasil, melainkan memastikan setiap perubahan yang mencapai `main` telah diuji pada jalur UI, API, evidence, keputusan pengiriman, privasi, dan deployment.

## 1. Definisi siap rilis

GateGuard dapat dianggap **siap rilis** hanya apabila seluruh kondisi berikut terpenuhi pada commit yang sama. Jika salah satu kondisi gagal, rilis harus ditahan dan statusnya dicatat sebagai `REVIEW` pada pull request.

| Area | Kriteria penerimaan | Bukti yang diperlukan |
|---|---|---|
| Frontend | ESLint, Vitest, dan production build lulus; seluruh route dapat dibangun; tidak ada kontrol browser mentah yang terlihat pada UI operasional. | Output CI dan inspeksi visual desktop/mobile. |
| UI/UX | Shell, form, tabel, dialog, empty state, loading state, error state, dan action state memakai primitive Kumo atau wrapper aplikasi yang setara. | Review screenshot sebelum/selesai dan walkthrough route utama. |
| Backend | `pytest` dan `ruff check` lulus; migration idempoten; readiness PostgreSQL sehat. | Output CI dan health endpoint. |
| Keamanan | Tidak ada credential di Git; CORS production spesifik origin; cookie aman; API key BFF aktif; header keamanan aktif; upload tervalidasi. | Secret scan, environment review, header check, dan test auth. |
| AI/OCR | Dokumen diperlakukan sebagai data tak tepercaya; output terstruktur; evidence tidak direka; confidence rendah atau data tidak lengkap tidak dapat otomatis menjadi `CLEAR`. | Test ekstraksi, test keputusan, dan sample review non-produksi. |
| Operasional | Backup, rollback, ownership, alert biaya, monitoring, dan prosedur akses insiden terdokumentasi. | Runbook deployment serta bukti timer/health pada lingkungan target. |

## 2. Urutan quality gate

Sebelum merge, jalankan pemeriksaan berikut dari root repository. Jalankan backend dan frontend dalam environment yang menggunakan lockfile proyek; jangan memakai dependency global yang tidak dipin.

```bash
cd backend
uv run ruff check .
uv run pytest

cd ../frontend
node_modules/.bin/eslint .
node_modules/.bin/vitest run
node_modules/.bin/next build
```

Build frontend harus menyelesaikan semua route App Router. Apabila sebuah route gagal build, halaman tersebut tidak boleh diasumsikan aman hanya karena route lain dapat dibuka.

## 3. Verifikasi UI dan alur pengguna

Pengujian browser minimum mencakup login, pemilih bahasa, perubahan password pertama, dashboard, pencarian global, create shipment, upload dokumen, hasil reconciliation, override supervisor, detail shipment, work queue, settings, integrations, serta sign out. Review harus dilakukan pada viewport desktop dan mobile.

> Field file boleh memakai elemen `input[type=file]` yang disembunyikan secara aksesibel, karena browser memerlukan primitive tersebut untuk membuka file picker. Seluruh surface yang terlihat—label, trigger, nama file, error, dan status—harus tetap memakai sistem visual GateGuard/Kumo.

Tidak boleh ada label teknis seperti enum backend, endpoint internal, nama action kode, atau raw secret yang dipakai sebagai copy UI. Status seperti `CLEAR`, `REVIEW`, `HOLD`, API, OCR, PDF, Invoice, dan Webhooks dapat dipertahankan karena sudah merupakan istilah operasional yang familiar.

## 4. Keamanan, privasi, dan data evidence

GateGuard memakai server-side session cookie, API key antara frontend BFF dan backend, header keamanan, same-origin check pada mutation, rate limit proses tunggal, serta batas ukuran/halaman/pixel untuk upload. Dokumen pelanggan dan token service account tidak boleh dimasukkan ke screenshot, fixture publik, console log, atau repository.

Token service account dan Webhook signing secret harus diperlakukan sebagai **one-time reveal**. UI hanya menampilkan token pada respons pembuatan, menyediakan aksi salin eksplisit, dan tidak menyimpan nilai tersebut pada local storage, query parameter, atau log browser.

AI/OCR dapat membantu ekstraksi namun bukan sumber kebenaran tanpa evidence. Provider hanya menerima dokumen sesuai konfigurasi environment; error provider tidak boleh diteruskan dengan body mentah. Hasil dengan evidence tidak lengkap, confidence rendah, tipe dokumen ambigu, atau line item yang tidak terbukti lengkap harus tetap memerlukan `REVIEW`.

## 5. Metadata dan pengindeksan

GateGuard adalah workspace terautentikasi, bukan situs pemasaran publik. Semua route aplikasi menggunakan metadata produk yang konsisten, tetapi memiliki `noindex, nofollow` dan `robots.txt` yang melarang crawl. Ini mencegah login, console, identifier pengiriman, dan route operasi muncul pada hasil pencarian.

Jika organisasi kelak membuat situs pemasaran publik, situs tersebut harus berada pada origin dan deployment terpisah. Hanya situs pemasaran yang memerlukan sitemap, canonical marketing URL, structured data, dan indexing publik.

## 6. Checklist deployment Azure

Sebelum traffic pengguna diarahkan ke rilis baru, pastikan domain HTTPS, `APP_PUBLIC_ORIGIN`, `CORS_ORIGINS`, `APP_API_KEY`, database PostgreSQL, dan credential provider OCR/AI sesuai environment target. Tidak ada secret yang boleh hard-coded pada Compose, cloud-init, atau workflow.

Setelah merge ke `main`, timer deployment akan mendeteksi SHA baru dan membangun ulang container. Verifikasi endpoint berikut setelah deployment selesai:

```bash
curl -fsS https://<domain>/login >/dev/null
curl -fsS https://<domain>/robots.txt
ssh -i <key> gateguardadmin@<host> 'docker compose -f /opt/gateguard/docker-compose.prod.yml ps'
```

Lakukan rollback dengan checkout ke SHA sehat terakhir atau dengan mengembalikan merge yang menyebabkan regresi, lalu biarkan timer menjalankan deployment kembali. Jangan mengedit container yang sedang berjalan sebagai substitusi perubahan repository.

## 7. Risiko yang harus dicatat sebelum produksi publik skala besar

Rate limiter aplikasi saat ini bersifat in-memory dan hanya memadai untuk satu instance. Jika deployment menjadi multi-instance atau menerima trafik tidak tepercaya dalam volume tinggi, tambahkan WAF/rate limit bersama di ingress. Domain `sslip.io` sesuai untuk verifikasi teknis sementara, tetapi domain organisasi sendiri dan email alert yang dipantau tetap diperlukan sebelum penggunaan bisnis jangka panjang.

Warning deprecation dari dependency `starlette.testclient` harus dilacak pada pembaruan FastAPI/Starlette berikutnya. Test suite lulus, tetapi upgrade dependency harus dilakukan pada pull request khusus dengan test penuh; jangan mengabaikan warning tersebut tanpa changelog dan verifikasi kompatibilitas.
