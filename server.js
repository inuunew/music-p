const express = require('express');
const path = require('path');
const { Spotify, drawCardSpotify } = require('./spotifyService');

const app = express();
const port = process.env.PORT || 3000;
const spotify = new Spotify();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. Endpoint Search
app.get('/api/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Query required' });
    const result = await spotify.search(q);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Endpoint Detail Track
app.get('/api/track/:id', async (req, res) => {
  try {
    const result = await spotify.track(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Endpoint Detail Artist
app.get('/api/artist/:id', async (req, res) => {
  try {
    const result = await spotify.artist(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Endpoint Detail Album
app.get('/api/album/:id', async (req, res) => {
  try {
    const result = await spotify.album(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Endpoint Detail Playlist
app.get('/api/playlist/:id', async (req, res) => {
  try {
    const result = await spotify.playlist(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Endpoint Generator Gambar Card (Sharp)
app.get('/api/card', async (req, res) => {
  try {
    const { title, artist, cover, bg } = req.query;
    const imageBuffer = await drawCardSpotify({ title, artist, cover, bg });
    
    if (!imageBuffer) return res.status(404).send('Gagal membuat gambar');
    
    res.set('Content-Type', 'image/png');
    res.send(imageBuffer);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Jalankan lokal jika bukan di environment produksi Vercel
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`Aplikasi berjalan di http://localhost:${port}`);
  });
}

// Ekspor aplikasi Express untuk Vercel Serverless
module.exports = app;
