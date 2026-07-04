import axios from "axios";

/* ====================== Scraper Download (gamepvz.com) ====================== */
async function SpotifyDl(url) {
  try {
    const { data: pp } = await axios.post(
      "https://gamepvz.com/api/download/get-url",
      { url },
      {
        headers: {
          "content-type": "application/json",
          "user-agent":
            "Mozilla/5.0 (Linux; Android 16; NX729J) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.7499.34 Mobile Safari/537.36",
        },
      }
    );

    if (!pp?.originalVideoUrl) {
      return { status: false, error: "Link audio tidak ditemukan dari scraper." };
    }

    const encoded = pp.originalVideoUrl.split("url=")[1];
    const decodedUrl = Buffer.from(encoded, "base64").toString("utf-8");

    return {
      status: true,
      title: pp.title || null,
      author: pp.authorName || null,
      cover: pp.coverUrl || null,
      dl: decodedUrl,
    };
  } catch (e) {
    return { status: false, error: e.message || "Gagal mengambil link dari scraper." };
  }
}

/* ====================== Handler ====================== */
export default async function handler(req, res) {
  const { endpoint, q } = req.query;
  const allowed = [
    "spotify-search",
    "spotify-track",
    "spotify-artist",
    "spotify-album",
    "spotify-playlist",
    "spotify-download",
  ];

  if (!endpoint || !allowed.includes(endpoint) || !q) {
    res.status(400).json({ status: false, error: "Parameter tidak valid." });
    return;
  }

  try {
    // ====== Endpoint download: pakai scraper langsung, TIDAK lagi ke api.inuutyz ======
    if (endpoint === "spotify-download") {
      const result = await SpotifyDl(q);

      if (!result.status) {
        res.status(502).json({ status: false, error: result.error || "Gagal mengambil link audio." });
        return;
      }

      res.status(200).json({
        status: true,
        result: {
          dl: result.dl,
          title: result.title,
          author: result.author,
          cover: result.cover,
        },
      });
      return;
    }

    // ====== Endpoint lain (search, track, artist, album, playlist): tetap pakai api.inuutyz ======
    const upstreamUrl = `https://api.inuutyz.web.id/api/search/${endpoint}?q=${encodeURIComponent(q)}`;
    const upstream = await fetch(upstreamUrl);
    const data = await upstream.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ status: false, error: "Gagal terhubung ke sumber data." });
  }
}
