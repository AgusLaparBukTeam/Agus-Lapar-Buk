# Security Policy

GateGuard memproses dokumen pengiriman yang tidak tepercaya dan dapat menangani data komersial yang sensitif. Keamanan aplikasi bergantung pada kode, konfigurasi environment, identity provider, jaringan, dan disiplin operasional yang digunakan saat deployment.

## Melaporkan Kerentanan

Jangan memasukkan secret, dokumen pelanggan, data pribadi, atau detail eksploitasi yang dapat digunakan langsung ke dalam issue publik. Gunakan private vulnerability reporting GitHub untuk repository ini apabila tersedia. Jika tidak tersedia, hubungi maintainer secara privat sebelum memublikasikan detail kerentanan.

Sertakan komponen yang terdampak, langkah reproduksi minimum, dampak yang diharapkan, versi atau commit terkait, dan mitigasi yang disarankan apabila sudah diketahui.

## Area Sensitif

Perubahan pada area berikut memerlukan review tambahan dan test yang sesuai:

- upload serta validasi file;
- extraction provider adapter;
- aturan rekonsiliasi;
- authorization dan audit history untuk supervisor override;
- backend proxy, session, dan authentication;
- migration database serta konfigurasi production;
- secret, identity, ingress, dan deployment automation.

## Batas Keamanan Aplikasi

Kontrol pada aplikasi tidak menggantikan identity enforcement, TLS, WAF atau ingress filtering, network isolation, backup, database hardening, dan secret management pada environment deployment. FastAPI tidak boleh diekspos langsung ke Internet; browser hanya berkomunikasi melalui Next.js BFF yang terautentikasi.

Credential provider, database, dan service-to-service harus berada di sisi server. Jangan mengirimkan `APP_API_KEY`, `OPENAI_API_KEY`, password, client secret, atau credential lain melalui `NEXT_PUBLIC_*`, source code, fixture, screenshot, issue, maupun log.

## Tindakan Setelah Perbaikan

Setelah kerentanan diperbaiki, maintainer perlu menilai perubahan konfigurasi yang menyertainya, menjalankan regresi keamanan yang relevan, dan merotasi credential apabila ada kemungkinan secret telah terekspos. Lihat [Deployment guide](docs/deployment.md) sebelum menggunakan data pengiriman nyata.
