export default async function handler(req, res) {
  const { endpoint, q } = req.query;
  const allowed = [
    "spotify-search",
    "spotify-track",
    "spotify-artist",
    "spotify-album",
    "spotify-playlist",
  ];

  if (!endpoint || !allowed.includes(endpoint) || !q) {
    res.status(400).json({ status: false, error: "Parameter tidak valid." });
    return;
  }

  try {
    const upstream = await fetch(
      `https://api.inuutyz.web.id/api/search/${endpoint}?q=${encodeURIComponent(q)}`
    );
    const data = await upstream.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ status: false, error: "Gagal terhubung ke sumber data." });
  }
}
