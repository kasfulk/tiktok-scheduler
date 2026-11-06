# Panduan mengaktifkan OAuth TikTok

OAuth-nya **sudah terpasang** di repo ini. Yang belum: kredensial app TikTok, URL callback
publik ber-HTTPS, dan approval scope dari TikTok. Panduan ini urutannya.

Semua nama file di bawah relatif ke root repo (`~/Projects/tiktok-scheduler`).

---

## 0. Apa yang sudah ada (jangan ditulis ulang)

| Bagian | File | Fungsi |
|---|---|---|
| Bangun URL authorize | `packages/tiktok/src/index.ts` → `buildAuthorizeUrl()` | `/v2/auth/authorize/` + `client_key`, `scope`, `response_type=code`, `redirect_uri`, `state` |
| Tukar code → token | `packages/tiktok/src/index.ts` → `exchangeAuthorizationCode()` | `POST /v2/oauth/token/`, `grant_type=authorization_code` |
| Refresh token | `packages/tiktok/src/index.ts` → `refreshAccessToken()` | `grant_type=refresh_token` |
| Anti-CSRF state | `apps/web/lib/oauth-state.ts` | HMAC `AUTH_SECRET`, nonce di cookie `tts_oauth_nonce`, umur 10 menit |
| Mulai alur | `apps/web/app/api/tiktok/connect/route.ts` | tombol Connect → `{ authorizeUrl }` |
| Terima callback | `apps/web/app/api/tiktok/callback/route.ts` | verifikasi state, tukar token, `encryptSecret()`, upsert `TikTokAccount` |
| Refresh terjadwal | `apps/worker/src/tokens.ts` → `ensureAccessToken()` | refresh kalau sisa umur < 5 menit, dikunci Redis per akun |
| Tombol UI | `apps/web/app/(dashboard)/accounts/page.tsx` | *Connect with TikTok* + *Connect via browser* |

Scope default: `user.info.basic,video.publish,video.upload` (`DEFAULT_SCOPES`).
Token disimpan terenkripsi (`TOKEN_ENCRYPTION_KEY`), sesi dienkripsi cookie httpOnly.

---

## 1. Buat app di TikTok for Developers

1. https://developers.tiktok.com → **Manage apps** → **Connect an app**.
2. Produk yang **wajib** ditambahkan ke app:
   - **Login Kit** (untuk authorize + token)
   - **Content Posting API** → aktifkan konfigurasi **Direct Post**, dan **Upload as draft / inbox**
3. Scope yang diminta di app:
   - `user.info.basic`
   - `video.publish`
   - `video.upload`
4. Catat **Client key** dan **Client secret** dari halaman app.

App baru = **unaudited**. Konsekuensinya (lihat §5), bukan opsional.

---

## 2. Sediakan URL publik ber-HTTPS

TikTok menolak redirect URI yang tidak `https`, tidak absolut, atau mengandung query string
(maksimal 10 URI terdaftar per app, panjang < 512 karakter).

Sekarang `.env` masih:

```
APP_URL=http://192.168.1.11:3100
TIKTOK_REDIRECT_URI=http://192.168.1.11:3100/api/tiktok/callback
```

Itu **tidak akan lolos**. Butuh domain HTTPS yang menunjuk ke host ini, mis. `cloudflared`
(sudah terpasang di `/usr/local/bin/cloudflared`, tapi belum ada sertifikat origin) atau Caddy +
domain sendiri. Yang penting: hostname-nya **stabil**, karena harus didaftarkan statis di portal.
Quick tunnel acak (`trycloudflare.com`) berubah tiap jalan — tidak praktis.

Contoh dengan named tunnel:

```bash
cloudflared tunnel login
cloudflared tunnel create tiktok-scheduler
cloudflared tunnel route dns tiktok-scheduler sched.domainkamu.com
cloudflared tunnel run --url http://127.0.0.1:3100 tiktok-scheduler
```

Daftarkan di portal TikTok (Login Kit → Redirect URI):

```
https://sched.domainkamu.com/api/tiktok/callback
```

Harus **persis sama** dengan `TIKTOK_REDIRECT_URI`, termasuk trailing slash (jangan pakai slash).

---

## 3. Isi kredensial

Edit `.env`:

```ini
APP_URL=https://sched.domainkamu.com
TIKTOK_REDIRECT_URI=https://sched.domainkamu.com/api/tiktok/callback
TIKTOK_CLIENT_KEY=<client key>
TIKTOK_CLIENT_SECRET=<client secret>
TIKTOK_API_MODE=live
TIKTOK_API_BASE_URL=https://open.tiktokapis.com
```

`AUTH_SECRET` dan `TOKEN_ENCRYPTION_KEY` sudah terisi (64 hex char) — jangan diganti, kalau diganti
semua sesi login dan token TikTok yang tersimpan jadi tidak terbaca, akun harus di-reconnect.

Buang juga baris salah tulis yang tidak dipakai kode mana pun:

```ini
TITOK_CLIENT_MODE=browser-mode
```

Muat ulang **web dan worker** — worker juga butuh client key/secret untuk refresh token:

```bash
cd ~/Projects/tiktok-scheduler
pm2 startOrReload ecosystem.config.cjs --only tiktok-scheduler-web,tiktok-scheduler-worker --update-env
pm2 save
```

`pm2 restart` biasa **tidak** cukup: `ecosystem.config.cjs` membaca `.env` sendiri saat load, jadi
env baru hanya terbaca lewat `startOrReload`.

---

## 4. Uji alurnya

**a. Mode mock dulu (tanpa app TikTok).** Pastikan alur + state + upsert akun jalan:

```bash
# sementara, hanya untuk instance demo
TIKTOK_API_MODE=mock
```

Di instance demo (:3101) tombol *Connect with TikTok* langsung "sukses" dengan akun
`mock_creator`. Kalau ini gagal, masalahnya di kode/cookie, bukan di TikTok.

**b. Mode live.** Buka `https://sched.domainkamu.com/accounts` → **Connect with TikTok** →
login TikTok → consent. Sukses = redirect ke `/accounts?connected=1` dan akun muncul dengan
`authMode = OAUTH`.

Cek di log web:

```bash
pm2 logs tiktok-scheduler-web --lines 50 --nostream
```

Yang harus **tidak** muncul: `tiktok_oauth_failed`.

Cek baris DB:

```bash
cd ~/Projects/tiktok-scheduler
python3 -c "
import sqlite3
c=sqlite3.connect('data/tiktok-scheduler.db')
print(c.execute('select username,displayName,authMode,scopes,connectionStatus from TikTokAccount').fetchall())"
```

`authMode` harus `OAUTH`, `scopes` memuat `video.publish,video.upload`.

**c. Publish percobaan.** Schedule satu video dengan privacy **`SELF_ONLY`** (lihat §5) lewat
Calendar → *Direct post*, lalu pantau:

```bash
pm2 logs tiktok-scheduler-worker --lines 50 --nostream
```

---

## 5. Batas app unaudited (penting, jangan kaget)

Selama app belum lolos **audit** Content Posting API:

- Semua post dipaksa **`SELF_ONLY`** (private), apa pun `privacy_level` yang dikirim.
- Maksimal **5 user** boleh posting per 24 jam.
- Akun TikTok penggunanya harus diset **private** saat posting.

Kode ini memvalidasi privacy terhadap `creator_info.privacy_level_options`
(`apps/worker/src/publish.ts:191`). Untuk app unaudited, TikTok hanya mengembalikan `SELF_ONLY`,
jadi jadwal dengan `PUBLIC_TO_EVERYONE` akan berhenti dengan `PRIVACY_NOT_ALLOWED` (terminal).
Selama masa uji, pakai `SELF_ONLY` saja.

Jalur praktis pra-audit: pilih **Upload as draft** (`publishMethod = UPLOAD_DRAFT`) — video masuk
ke inbox TikTok, user menekan publish sendiri dari aplikasi. Status berakhir di
`MANUAL_ACTION_REQUIRED` dengan kode `INBOX_DELIVERED`, itu normal.

Batas yang berlaku **baik audited maupun unaudited** (dari Content Sharing Guidelines):

- **Creator cap**: maksimal 24 jam per creator, angka tergantung estimasi di form audit.
- **Posting cap**: ±15 post per hari per akun creator, dibagi bersama semua API client yang
  memakai Direct Post.

Catatan untuk audit: panduan TikTok menyatakan `FILE_UPLOAD` dipakai kalau video ada di perangkat
user, sedangkan file yang sudah tersimpan di server sebaiknya memakai `PULL_FROM_URL` + verifikasi
kepemilikan domain (Manage URL properties). Aplikasi ini menyimpan video di `STORAGE_ROOT`
(server-side) dan mengirim `FILE_UPLOAD` (`source: 'FILE_UPLOAD'` di
`packages/tiktok/src/index.ts` → `initBody`). Kalau reviewer menolak, itu titik yang perlu diubah.

Ajukan audit di https://developers.tiktok.com/application/content-posting-api setelah integrasi
terbukti jalan. Tidak ada SLA publik untuk durasi review.

---

## 6. Kalau ada yang gagal

| Gejala | Penyebab | Perbaikan |
|---|---|---|
| `TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET are required in live mode` | env kosong saat `TIKTOK_API_MODE=live` | §3, lalu `startOrReload` |
| `/accounts?error=Invalid or expired OAuth state` | callback > 10 menit, cookie `tts_oauth_nonce` hilang (ganti domain / blokir cookie) | ulangi dari tombol Connect |
| `/accounts?error=This TikTok account is linked to another user` | `openId` sudah terikat user lain | putuskan dulu di akun lama, atau pakai user yang sama |
| Redirect balik ke halaman TikTok terus | `redirect_uri` di `.env` ≠ yang didaftarkan di portal | samakan persis, termasuk skema https |
| Akun jadi `EXPIRED` | refresh token gagal (dicabut / > 365 hari) | Connect ulang |
| `PRIVACY_NOT_ALLOWED` | app unaudited | §5 |
| Login tak bisa masuk setelah `APP_URL` jadi https | cookie `Secure` dikirim, tapi browser akses lewat `http://192.168.1.11:3100` | akses via domain https. `COOKIE_SECURE=false` bisa dipakai untuk LAN http, tapi cookie jadi ikut terkirim tanpa TLS — hanya untuk jaringan tepercaya |

Hal yang perlu dicek saat uji live pertama: `buildAuthorizeUrl()` tidak mengirim
`code_challenge`/`code_verifier` (PKCE). Kalau portal TikTok mewajibkan PKCE untuk app kamu,
authorize akan ditolak sebelum callback — tambahannya di `packages/tiktok/src/index.ts`
(`buildAuthorizeUrl`, `exchangeAuthorizationCode`) plus simpan verifier di cookie bersama nonce.

---

## 7. Setelah OAuth aktif

- Akun `BROWSER` (`daily.nashoih`) tidak perlu dihapus; keduanya bisa hidup berdampingan. Worker
  memilih jalur per `authMode` (`apps/worker/src/publish.ts:146`). Akun OAuth memakai API,
  akun browser memakai CDP.
- Jadikan akun OAuth sebagai default: Accounts → *Set default* (mempengaruhi `defaultAccountId`).
- Rotasi `TIKTOK_CLIENT_SECRET` kapan saja; token user yang sudah ada tidak ikut batal.
