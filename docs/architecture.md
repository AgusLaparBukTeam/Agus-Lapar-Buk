# Architecture

GateGuard adalah pemeriksaan konsistensi pra-pengiriman untuk tiga dokumen shipment: Delivery Order, Invoice, dan Packing List.

## Batasan Desain

Ekstraksi bersifat probabilistik; kontrol dispatch tidak boleh demikian.

Layer ekstraksi mengubah dokumen menjadi evidence terstruktur. Layer rekonsiliasi memiliki keputusan operasional. Tidak ada OCR engine atau language model yang diizinkan menetapkan `CLEAR`, `REVIEW`, atau `HOLD` secara langsung.

## Alur Request

1. Browser mengirim tiga file yang diperlukan ke Next.js BFF.
2. BFF meneruskan request ke FastAPI dengan service credential yang hanya berada di server.
3. FastAPI memvalidasi tipe file, signature, ukuran, dimensi gambar, dan batas PDF.
4. Extraction router membaca dokumen menggunakan provider yang dikonfigurasi.
5. Nilai hasil ekstraksi dinormalisasi ke canonical shipment schema.
6. Aturan rekonsiliasi deterministik membandingkan field penting dan line item.
7. Hasil, evidence, serta keputusan sistem disimpan.
8. Supervisor dapat merekam override. Keputusan awal sistem tetap immutable.

## Trust Boundary

### Browser ke BFF

Browser tidak tepercaya. Browser tidak pernah menerima backend service credential atau provider API key.

### BFF ke API

BFF adalah application client resmi untuk backend. BFF meneruskan session cookie HttpOnly sambil menjaga service API key tetap di server. Service API key melindungi backend dari panggilan langsung tanpa autentikasi; credential ini bukan pengganti user authentication atau RBAC.

### Dokumen ke Ekstraksi

Dokumen yang diunggah adalah input tidak tepercaya. Dokumen diperlakukan sebagai data, bukan instruksi. Validasi file dan resource limit dijalankan sebelum ekstraksi.

### Ekstraksi ke Rekonsiliasi

Output provider adalah evidence tidak tepercaya. Nilai penting mencakup provenance dan confidence. Evidence yang hanya berasal dari model dibatasi oleh confidence dan tidak dapat mengotorisasi `CLEAR` secara mandiri.

### Jalur Override

Supervisor override memerlukan session supervisor atau admin dan merekam user ID terautentikasi, snapshot display name, alasan, status sebelumnya, status akhir, serta timestamp. Request tidak dapat memasok actor arbitrer atau shared supervisor credential.

## Semantik Keputusan

### `CLEAR`

Digunakan hanya ketika evidence deterministik yang diperlukan lengkap dan setara menurut normalisasi konservatif.

### `REVIEW`

Digunakan ketika sistem tidak dapat membedakan secara aman variasi yang dapat diterima dari konflik material, termasuk extraction confidence rendah dan near-text match.

### `HOLD`

Digunakan untuk konflik deterministik yang material, seperti quantity, SKU, identitas dokumen, atau mismatch kritis lintas dokumen lainnya.

## Persistensi

SQLite didukung untuk local development. Konfigurasi production memerlukan PostgreSQL dan schema migration melalui Alembic.

File upload mentah diproses pada temporary storage yang dibatasi scope dan tidak dipersist secara default. Record yang dipersist berisi hasil terstruktur dan audit state.

## Non-Goals

GateGuard tidak dimaksudkan untuk:

- memverifikasi isi fisik paket;
- menggantikan WMS, ERP, atau TMS;
- mengotorisasi pembayaran;
- menetapkan kebenaran pajak atau akuntansi;
- membuktikan bahwa tiga dokumen yang konsisten mengacu pada order yang benar.

Untuk authorization dispatch, tambahkan referensi shipment dari WMS/ERP tepercaya dan aturan unit-of-measure yang eksplisit.
