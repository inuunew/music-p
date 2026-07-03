# Piringan

Aplikasi pencarian katalog musik (lagu, album, artis, playlist) memakai
API publik `api.inuutyz.web.id`. Tidak ada fitur unduh audio.

## Jalan lokal

```bash
npm install
npm run dev
```

## Deploy ke Vercel

1. Push folder ini ke repo GitHub baru.
2. Di Vercel: **Add New → Project**, pilih repo tersebut.
3. Framework preset otomatis terdeteksi sebagai **Vite** — biarkan default:
   - Build Command: `vite build`
   - Output Directory: `dist`
4. Deploy.

Tidak perlu environment variable apa pun karena frontend memanggil
`api.inuutyz.web.id` langsung dari browser.

## Catatan

- Gambar sampul dimuat dari `i.scdn.co`. Jika suatu saat CDN tersebut
  membatasi CORS, fitur "Bikin Kartu → Unduh sebagai gambar" bisa gagal
  menyertakan cover (fallback otomatis ke warna polos).
- Tidak ada fitur streaming/unduh audio — silakan tambahkan sendiri jika perlu.
