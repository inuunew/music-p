const BASE_URL = 'https://api.inuutyz.web.id/api';

// 1. API Spotify Search
export const fetchSearch = async (query = 'Melukis senja') => {
  const response = await fetch(`${BASE_URL}/search/spotify-search?q=${encodeURIComponent(query)}`);
  if (!response.ok) throw new Error("Gagal melakukan pencarian");
  return await response.json();
};

// 2. API Spotify Track
export const fetchTrack = async (id = '3KsBW6G7OKJtWeZbG17yhr') => {
  const response = await fetch(`${BASE_URL}/search/spotify-track?q=${id}`);
  if (!response.ok) throw new Error("Gagal mengambil track");
  return await response.json();
};

// 3. API Spotify Artist
export const fetchArtist = async (id = '4NGKV5T9KOY3eGtJ42fax0') => {
  const response = await fetch(`${BASE_URL}/search/spotify-artist?q=${id}`);
  if (!response.ok) throw new Error("Gagal mengambil artis");
  return await response.json();
};

// 4. API Spotify Album
export const fetchAlbum = async (id = 'spotify:album:3g63mVs52amyovYd8HWHqf') => {
  const response = await fetch(`${BASE_URL}/search/spotify-album?q=${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error("Gagal mengambil album");
  return await response.json();
};

// 5. API Spotify Playlist
export const fetchPlaylist = async (id = '37i9dQZF1E8O8KuHPnbPFh') => {
  const response = await fetch(`${BASE_URL}/search/spotify-playlist?q=${id}`);
  if (!response.ok) throw new Error("Gagal mengambil playlist");
  return await response.json();
};

// 6. API Spotify Download
export const fetchDownload = async (url = 'https://open.spotify.com/track/3KsBW6G7OKJtWeZbG17yhr') => {
  const response = await fetch(`${BASE_URL}/download/spotify?url=${encodeURIComponent(url)}`);
  if (!response.ok) throw new Error("Gagal mengambil link download");
  return await response.json();
};
