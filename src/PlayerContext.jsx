import { createContext, useContext, useState, useRef, useCallback } from "react";

const PlayerContext = createContext(null);

export function PlayerProvider({ children }) {
  const [track, setTrack] = useState(null); // { id, title, artist, cover, dl }
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(new Audio());

  // fungsi untuk mengambil link download & memutar
  const play = useCallback(async (trackId) => {
    // 1. Ambil metadata dari API internal kamu
    const metaRes = await fetch(
      `/api/spotify?endpoint=spotify-track&q=${encodeURIComponent(trackId)}`
    );
    const metaJson = await metaRes.json();
    if (!metaJson?.status || !metaJson.result) {
      alert("Gagal memuat metadata lagu.");
      return;
    }
    const t = metaJson.result;

    // 2. Ambil link download dari API Spotify Download
    const spotifyUrl = `https://open.spotify.com/track/${trackId}`;
    const dlRes = await fetch(
      `https://api.inuutyz.web.id/api/download/spotify-dl?url=${encodeURIComponent(spotifyUrl)}`
    );
    const dlJson = await dlRes.json();
    if (!dlJson?.status || !dlJson.result?.dl) {
      alert("Gagal mendapatkan link audio.");
      return;
    }

    const audioUrl = dlJson.result.dl;

    // 3. Simpan data lagu & putar
    const newTrack = {
      id: t.id,
      title: t.name,
      artist: t.artists?.map((a) => a.name).join(", ") || "Tidak diketahui",
      cover: t.album?.images?.[0]?.url || null,
      dl: audioUrl,
    };
    setTrack(newTrack);
    audioRef.current.src = audioUrl;
    audioRef.current.play();
    setPlaying(true);
  }, []);

  const togglePlay = useCallback(() => {
    if (!track) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setPlaying(!playing);
  }, [track, playing]);

  const stop = useCallback(() => {
    audioRef.current.pause();
    audioRef.current.src = "";
    setTrack(null);
    setPlaying(false);
  }, []);

  // event listener (optional)
  audioRef.current.onended = () => setPlaying(false);
  audioRef.current.onerror = () => {
    alert("Gagal memutar audio.");
    stop();
  };

  return (
    <PlayerContext.Provider value={{ track, playing, play, togglePlay, stop }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  return useContext(PlayerContext);
}