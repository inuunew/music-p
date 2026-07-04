import { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";

const API = "/api/spotify";

// Ambil link download, dengan retry otomatis kalau backend belum siap / gagal.
// Dipisah jadi fungsi sendiri (sama seperti pola di music.html) supaya loadTrack tetap ringkas.
async function fetchDownloadLink(spotifyUrl) {
  const maxAttempts = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`${API}?endpoint=spotify-download&q=${encodeURIComponent(spotifyUrl)}`);
      const json = await res.json();
      if (json?.status && json.result?.dl) {
        return json.result.dl;
      }
      lastError = new Error("Link download tidak tersedia");
    } catch (e) {
      lastError = e;
      console.warn(`Percobaan ${attempt} gagal:`, e.message);
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, attempt * 2500)); // 1s, lalu 2s
    }
  }
  throw lastError || new Error("Gagal mendapatkan link download");
}
/* ====================== Player Context (diperbarui) ====================== */
const PlayerContext = createContext(null);

function PlayerProvider({ children }) {
  const [track, setTrack] = useState(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const audioRef = useRef(null);
  const retryCountRef = useRef(0);
  const stallTimeoutRef = useRef(null);
  const previewRetryRef = useRef(false);

  const loadTrack = useCallback(async (trackId, knownMeta = null, isRetry = false) => {
    if (!isRetry) {
      retryCountRef.current = 0;
      previewRetryRef.current = false;
    }
    setLoading(true);
    try {
      // Kalau metadata belum diketahui, ambil DULU (sekuensial, aman dari tabrakan backend)
      let t = knownMeta;
      if (!t) {
        const metaJson = await fetch(`${API}?endpoint=spotify-track&q=${encodeURIComponent(trackId)}`).then((r) => r.json());
        if (!metaJson?.status || !metaJson.result) {
          alert("Gagal memuat metadata lagu.");
          setLoading(false);
          return;
        }
        t = metaJson.result;
      }

      // Baru ambil link download SETELAH metadata selesai — download dulu, baru diputar
      const spotifyUrl = `https://open.spotify.com/track/${trackId}`;
      const dlUrl = await fetchDownloadLink(spotifyUrl);

      setTrack({
        id: t.id || trackId,
        title: t.name || t.title,
        artist: t.artists?.map((a) => a.name).join(", ") || "Tidak diketahui",
        cover: t.album?.images?.[0]?.url || t.cover || null,
        album: t.album?.name || t.album || null,
        dl: dlUrl,
      });
    } catch (err) {
      console.error(err);
      alert(`Gagal memuat lagu: ${err.message}`);
      setLoading(false);
    }
  }, []);

  const play = useCallback((trackId, meta = null) => {
    setQueue([{ id: trackId, meta }]);
    setQueueIndex(0);
    loadTrack(trackId, meta);
  }, [loadTrack]);

  const playQueue = useCallback((tracks, startIndex = 0) => {
    if (!tracks || !tracks.length) return;
    const entries = tracks.map((t) => ({ id: t.id, meta: t }));
    setQueue(entries);
    setQueueIndex(startIndex);
    loadTrack(entries[startIndex].id, entries[startIndex].meta);
  }, [loadTrack]);

  const next = useCallback(() => {
    const nextIdx = queueIndex + 1;
    if (nextIdx < queue.length) {
      setQueueIndex(nextIdx);
      loadTrack(queue[nextIdx].id, queue[nextIdx].meta);
    }
  }, [queue, queueIndex, loadTrack]);

  const previous = useCallback(() => {
    const prevIdx = queueIndex - 1;
    if (prevIdx >= 0) {
      setQueueIndex(prevIdx);
      loadTrack(queue[prevIdx].id, queue[prevIdx].meta);
    }
  }, [queue, queueIndex, loadTrack]);

  const hasNext = queueIndex >= 0 && queueIndex < queue.length - 1;
  const hasPrevious = queueIndex > 0;

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (audioRef.current.paused) {
      audioRef.current.play().catch(err => console.error(err));
    } else {
      audioRef.current.pause();
    }
  }, []);

  const seek = useCallback((time) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  }, []);

  const stop = useCallback(() => {
    if (stallTimeoutRef.current) clearTimeout(stallTimeoutRef.current);
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setTrack(null);
    setLoading(false);
    setPlaying(false);
    setReady(false);
    setCurrentTime(0);
    setDuration(0);
    setSheetOpen(false);
    setQueue([]);
    setQueueIndex(-1);
  }, []);

  // ====== Media Session API ======
  useEffect(() => {
    if (!track) return;
    if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
    const setHandler = (action, handler) => {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch (e) {}
    };
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album || "Piringan",
        artwork: track.cover
          ? [64, 96, 128, 192, 256, 384, 512].map((size) => ({ src: track.cover, sizes: `${size}x${size}`, type: "image/jpeg" }))
          : [],
      });
    } catch (e) { console.warn("Media Session metadata gagal diset:", e); }
    setHandler("play", () => { audioRef.current?.play().catch(() => {}); });
    setHandler("pause", () => { audioRef.current?.pause(); });
    setHandler("stop", () => stop());
    setHandler("previoustrack", hasPrevious ? () => previous() : null);
    setHandler("nexttrack", hasNext ? () => next() : null);
    setHandler("seekto", (details) => {
      if (audioRef.current && typeof details.seekTime === "number") {
        audioRef.current.currentTime = details.seekTime;
        setCurrentTime(details.seekTime);
      }
    });
    return () => {
      ["play", "pause", "stop", "previoustrack", "nexttrack", "seekto"].forEach((action) => {
        try { navigator.mediaSession.setActionHandler(action, null); } catch (e) {}
      });
    };
  }, [track?.id, hasNext, hasPrevious, next, previous, stop]);

  useEffect(() => {
    try {
      if (!("mediaSession" in navigator)) return;
      navigator.mediaSession.playbackState = playing ? "playing" : "paused";
    } catch (e) {}
  }, [playing]);

  useEffect(() => {
    if (!("mediaSession" in navigator) || !("setPositionState" in navigator.mediaSession)) return;
    if (!ready || !duration) return;
    try {
      navigator.mediaSession.setPositionState({ duration, playbackRate: 1, position: Math.min(currentTime, duration) });
    } catch (e) {}
  }, [currentTime, duration, ready]);

  // ====== Pemasangan listener + retry & stall-timeout + deteksi preview ======
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;

    const clearStallTimeout = () => {
      if (stallTimeoutRef.current) {
        clearTimeout(stallTimeoutRef.current);
        stallTimeoutRef.current = null;
      }
    };

    const handleFailure = () => {
      if (retryCountRef.current < 1) {
        retryCountRef.current += 1;
        console.warn("Audio gagal/macet, mencoba ambil link baru... (percobaan ke-", retryCountRef.current, ")");
        loadTrack(track.id, {
          id: track.id, name: track.title,
          artists: [{ name: track.artist }],
          album: { name: track.album, images: track.cover ? [{ url: track.cover }] : [] }
        }, true);
      } else {
        console.error("Audio tetap gagal setelah retry.");
        alert("Tidak dapat memutar lagu setelah beberapa percobaan. Coba lagi nanti.");
        setLoading(false);
        setReady(false);
      }
    };

    const onCanPlay = () => {
      clearStallTimeout();
      setReady(true);
      setLoading(false);
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      const nextIdx = queueIndex + 1;
      if (nextIdx < queue.length) {
        setQueueIndex(nextIdx);
        loadTrack(queue[nextIdx].id, queue[nextIdx].meta);
      } else {
        stop();
      }
    };
    const onTimeUpdate = () => setCurrentTime(audio.currentTime || 0);
    const onLoadedMeta = () => {
      const dur = audio.duration || 0;
      setDuration(dur);

      // Deteksi kemungkinan preview URL (biasanya ~29-30 detik)
      if (dur > 0 && dur < 35 && !previewRetryRef.current) {
        previewRetryRef.current = true;
        console.warn("Terdeteksi kemungkinan link preview (durasi pendek), mencoba ambil ulang link full...");
        loadTrack(track.id, {
          id: track.id, name: track.title,
          artists: [{ name: track.artist }],
          album: { name: track.album, images: track.cover ? [{ url: track.cover }] : [] }
        }, true);
      }
    };
    const onError = () => {
      clearStallTimeout();
      handleFailure();
    };

    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMeta);
    audio.addEventListener("error", onError);

    audio.src = track.dl;
    audio.load();
    setReady(false);
    setCurrentTime(0);
    setLoading(true);

    clearStallTimeout();
    stallTimeoutRef.current = setTimeout(() => {
      if (audio.readyState < 3) {
        console.warn("Audio stall timeout tercapai.");
        handleFailure();
      }
    }, 12000);

    return () => {
      clearStallTimeout();
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMeta);
      audio.removeEventListener("error", onError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.dl]);

  return (
    <PlayerContext.Provider
      value={{
        track, loading, playing, ready, currentTime, duration, sheetOpen,
        play, playQueue, next, previous, hasNext, hasPrevious,
        togglePlay, stop, seek, setSheetOpen,
      }}
    >
      {children}
      <audio ref={audioRef} style={{ display: "none" }} />
    </PlayerContext.Provider>
  );
}

function usePlayer() {
  return useContext(PlayerContext);
}

/* ====================== Playlist Context (lokal, tersimpan di perangkat) ====================== */
const PlaylistContext = createContext(null);
const PLAYLIST_STORE_KEY = "piringan_playlists_v1";

function loadPlaylists() {
  try {
    const raw = localStorage.getItem(PLAYLIST_STORE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function PlaylistProvider({ children }) {
  const [playlists, setPlaylists] = useState(loadPlaylists);

  useEffect(() => {
    try {
      localStorage.setItem(PLAYLIST_STORE_KEY, JSON.stringify(playlists));
    } catch (e) {
      console.warn("Tidak bisa menyimpan playlist:", e);
    }
  }, [playlists]);

  const createPlaylist = useCallback((name) => {
    const clean = (name || "").trim();
    if (!clean) return null;
    const id = `pl_${Date.now()}`;
    setPlaylists((prev) => [...prev, { id, name: clean, tracks: [], createdAt: Date.now() }]);
    return id;
  }, []);

  const deletePlaylist = useCallback((id) => {
    setPlaylists((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const addTrackToPlaylist = useCallback((playlistId, track) => {
    setPlaylists((prev) =>
      prev.map((p) => {
        if (p.id !== playlistId) return p;
        if (p.tracks.some((t) => t.id === track.id)) return p; // sudah ada
        return { ...p, tracks: [...p.tracks, track] };
      })
    );
  }, []);

  const removeTrackFromPlaylist = useCallback((playlistId, trackId) => {
    setPlaylists((prev) =>
      prev.map((p) => (p.id === playlistId ? { ...p, tracks: p.tracks.filter((t) => t.id !== trackId) } : p))
    );
  }, []);

  return (
    <PlaylistContext.Provider value={{ playlists, createPlaylist, deletePlaylist, addTrackToPlaylist, removeTrackFromPlaylist }}>
      {children}
    </PlaylistContext.Provider>
  );
}

function usePlaylists() {
  return useContext(PlaylistContext);
}

/* ====================== Install Prompt Context (Add to Home Screen) ====================== */
const InstallContext = createContext(null);

function InstallProvider({ children }) {
  const [installEvent, setInstallEvent] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState("unknown"); // "android" | "ios" | "desktop" | "unknown"

  useEffect(() => {
    const ua = navigator.userAgent || "";
    const isIos = /iphone|ipad|ipod/i.test(ua);
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;

    setPlatform(isIos ? "ios" : /android/i.test(ua) ? "android" : "desktop");
    if (isStandalone) setInstalled(true);

    const onBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setInstallEvent(e);
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!installEvent) return false;
    installEvent.prompt();
    const choice = await installEvent.userChoice;
    setInstallEvent(null);
    if (choice.outcome === "accepted") setInstalled(true);
    return choice.outcome === "accepted";
  }, [installEvent]);

  return (
    <InstallContext.Provider
      value={{ canInstall: !!installEvent, installed, platform, promptInstall }}
    >
      {children}
    </InstallContext.Provider>
  );
}

function useInstallPrompt() {
  return useContext(InstallContext);
}

// Ubah objek trek (dari katalog ATAU dari player yang sedang berjalan) menjadi bentuk
// ringkas yang konsisten untuk disimpan di playlist lokal.
function toPlaylistTrack(t) {
  const isPlayerShape = typeof t.album !== "object";
  return {
    id: t.id,
    name: t.name || t.title,
    artists: t.artists || (t.artist ? [{ name: t.artist }] : []),
    album: isPlayerShape
      ? (t.cover ? { name: t.album || null, images: [{ url: t.cover, width: 500 }] } : null)
      : t.album,
    duration_ms: t.duration_ms,
    explicit: t.explicit,
  };
}

/* ====================== Modal: Tambah ke Playlist ====================== */
function AddToPlaylistModal({ track, onClose }) {
  const { playlists, createPlaylist, addTrackToPlaylist } = usePlaylists();
  const [newName, setNewName] = useState("");

  if (!track) return null;

  const handleAdd = (playlistId) => {
    addTrackToPlaylist(playlistId, toPlaylistTrack(track));
    onClose();
  };

  const handleCreateAndAdd = (e) => {
    e.preventDefault();
    const id = createPlaylist(newName);
    if (id) handleAdd(id);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Tambah ke Playlist</h3>
          <button className="modal-close" onClick={onClose}><i className="fa-solid fa-xmark"></i></button>
        </div>
        <p className="modal-track-name">{track.name || track.title}</p>

        {playlists.length > 0 && (
          <div className="modal-playlist-list">
            {playlists.map((p) => {
              const already = p.tracks.some((t) => t.id === track.id);
              return (
                <button key={p.id} className="modal-playlist-row" onClick={() => !already && handleAdd(p.id)} disabled={already}>
                  <span>{p.name}</span>
                  <span className="modal-playlist-count">{already ? "Sudah ada ✓" : `${p.tracks.length} lagu`}</span>
                </button>
              );
            })}
          </div>
        )}

        <form className="modal-new-playlist" onSubmit={handleCreateAndAdd}>
          <input
            placeholder="Buat playlist baru…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button type="submit" disabled={!newName.trim()}>+ Buat &amp; Tambah</button>
        </form>
      </div>
    </div>
  );
}

/* ====================== helpers ====================== */
function fmtDuration(ms) {
  if (!ms && ms !== 0) return "--:--";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function fmtNumber(n) {
  if (n === null || n === undefined) return "0";
  return n.toLocaleString("id-ID");
}

function pickImage(images, minWidth = 300) {
  if (!images || !images.length) return null;
  const withUrl = images.filter((i) => i && i.url);
  if (!withUrl.length) return null;
  const sized = withUrl.filter((i) => typeof i.width === "number");
  if (!sized.length) return withUrl[0].url;
  const sorted = [...sized].sort((a, b) => a.width - b.width);
  const fit = sorted.find((i) => i.width >= minWidth);
  return (fit || sorted[sorted.length - 1]).url;
}

function artistNames(artists) {
  if (!artists || !artists.length) return "Tidak diketahui";
  return artists.map((a) => a.name).filter(Boolean).join(", ");
}

async function apiGet(endpoint, q) {
  const url = `${API}?endpoint=${encodeURIComponent(endpoint)}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url);
  const json = await res.json();
  if (!json || !json.status || !json.result) {
    throw new Error(json?.error || "Data tidak ditemukan di katalog.");
  }
  return json.result;
}

function useApiFetch(endpoint, query) {
  const [state, setState] = useState({ status: "idle" });

  useEffect(() => {
    if (!query) return;
    let cancelled = false;
    setState({ status: "loading" });
    apiGet(endpoint, query)
      .then((data) => {
        if (!cancelled) setState({ status: "success", data });
      })
      .catch((err) => {
        if (!cancelled)
          setState({
            status: "error",
            error: err.message || "Gagal terhubung ke katalog.",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint, query]);

  return state;
}

/* ====================== Vinyl Disc & Atoms ====================== */
function VinylDisc({ size = 40, spinning = false, cover = null }) {
  return (
    <div className="disc" style={{ width: size, height: size, animationPlayState: spinning ? "running" : "paused" }}>
      <svg viewBox="0 0 100 100" width="100%" height="100%">
        <circle cx="50" cy="50" r="49" fill="#0E0C0A" />
        <circle cx="50" cy="50" r="49" fill="none" stroke="#3A322A" strokeWidth="0.6" />
        {[44, 38, 32, 26].map((r) => (
          <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="#251F1A" strokeWidth="0.5" />
        ))}
        {cover ? (
          <>
            <clipPath id="discClip">
              <circle cx="50" cy="50" r="20" />
            </clipPath>
            <image href={cover} x="30" y="30" width="40" height="40" clipPath="url(#discClip)" preserveAspectRatio="xMidYMid slice" />
          </>
        ) : (
          <circle cx="50" cy="50" r="20" fill="#E8532B" />
        )}
        <circle cx="50" cy="50" r="3.2" fill="#14110E" />
      </svg>
    </div>
  );
}

function Chip({ children, tone = "muted" }) {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}

function CatalogLabel({ n, children }) {
  return (
    <div className="catalog-label">
      <span className="catalog-n">{n}</span>
      <span className="catalog-t">{children}</span>
    </div>
  );
}

function LoadingState({ label = "Memutar ulang katalog…" }) {
  return (
    <div className="state-block">
      <VinylDisc size={56} spinning />
      <p>{label}</p>
    </div>
  );
}

function ErrorState({ message }) {
  return (
    <div className="state-block state-error">
      <div className="state-icon">✕</div>
      <p>Gagal memuat. {message}</p>
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="state-block">
      <div className="state-icon">◌</div>
      <p>{message}</p>
    </div>
  );
}

/* ====================== Cards & Crate ====================== */
function EntityCard({ image, title, subtitle, meta, round, badge, onClick }) {
  return (
    <button className="e-card" onClick={onClick} disabled={!onClick}>
      <div className={`e-cover ${round ? "round" : ""}`}>
        {image ? <img src={image} alt="" loading="lazy" /> : <div className="e-cover-fallback">♪</div>}
        {badge && <span className="e-badge">{badge}</span>}
      </div>
      <div className="e-title">{title}</div>
      {subtitle && <div className="e-subtitle">{subtitle}</div>}
      {meta && <div className="e-meta">{meta}</div>}
    </button>
  );
}

function CrateRow({ n, title, items, render }) {
  if (!items || !items.length) return null;
  return (
    <section className="crate">
      <CatalogLabel n={n}>{title}</CatalogLabel>
      <div className="crate-scroll">{items.map(render)}</div>
    </section>
  );
}

/* ====================== Search ====================== */
function SearchBar({ value, onChange, onSubmit, autoFocus }) {
  return (
    <form className="search-bar" onSubmit={(e) => { e.preventDefault(); onSubmit(value.trim()); }}>
      <span className="search-icon"><i className="fa-solid fa-magnifying-glass"></i></span>
      <input autoFocus={autoFocus} placeholder="Cari lagu, album, artis, atau playlist…" value={value} onChange={(e) => onChange(e.target.value)} />
      <button type="submit">Cari</button>
    </form>
  );
}

function FilterChips({ value, onChange, options }) {
  return (
    <div className="filter-chips">
      {options.map((opt) => (
        <button
          key={opt.key}
          className={`filter-chip ${value === opt.key ? "active" : ""}`}
          onClick={() => onChange(opt.key)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ====================== Views ====================== */
function HomeView({ nav }) {
  return (
    <div className="view">
      <div className="hero">
        <VinylDisc size={84} />
        <h1>Buka sampul, <em>putar sesuatu</em>.</h1>
        <p className="hero-sub">Telusuri katalog Spotify — lagu, album, artis, dan playlist — disusun seperti krat piringan hitam.</p>
        <button className="cta" onClick={() => nav("search")}><i className="fa-solid fa-magnifying-glass"></i> Mulai Cari</button>
      </div>
      <div className="hint-row">
        <span>Coba:</span>
        {["Melukis Senja", "Fynn Jamal", "Budi Doremi"].map((s) => (
          <button key={s} className="hint-chip" onClick={() => nav("search")}>{s}</button>
        ))}
      </div>
    </div>
  );
}

function ResultsCrates({ data, query, nav }) {
  const anyResults = (data.top_results?.length || data.tracks?.length || data.albums?.length || data.artists?.length || data.playlists?.length || data.episodes?.length || data.podcasts?.length || data.genres?.length || data.users?.length);
  if (!anyResults) return <EmptyState message={`Tidak ada yang cocok dengan "${query}".`} />;

  return (
    <div className="crates">
      <CrateRow n="00" title="Hasil Teratas" items={data.top_results} render={(item, i) => {
          const clickable = ["Track", "Album", "Artist", "Playlist"].includes(item.type);
          return <EntityCard key={item.uri + i} image={pickImage(item.images)} title={item.name || "Tanpa nama"} subtitle={item.type} round={item.type === "Artist"} onClick={clickable ? () => nav(item.type.toLowerCase(), item.id) : undefined} />;
        }} />
      <CrateRow n="01" title="Lagu" items={data.tracks} render={(t) => <EntityCard key={t.uri} image={pickImage(t.album?.images)} title={t.name} subtitle={artistNames(t.artists)} meta={fmtDuration(t.duration_ms)} badge={t.explicit ? "E" : null} onClick={() => nav("track", t.id)} />} />
      <CrateRow n="02" title="Album" items={data.albums} render={(a) => <EntityCard key={a.uri} image={pickImage(a.images)} title={a.name} subtitle={`${artistNames(a.artists)} · ${a.release_year || "—"}`} meta={a.type} onClick={() => nav("album", a.id)} />} />
      <CrateRow n="03" title="Artis" items={data.artists} render={(a) => <EntityCard key={a.uri} image={pickImage(a.images)} title={a.name} round onClick={() => nav("artist", a.id)} />} />
      <CrateRow n="04" title="Playlist" items={data.playlists} render={(p) => <EntityCard key={p.uri} image={pickImage(p.images)} title={p.name} subtitle={p.owner?.display_name ? `oleh ${p.owner.display_name}` : null} onClick={() => nav("playlist", p.id)} />} />
      <CrateRow n="05" title="Episode" items={data.episodes} render={(e) => <EntityCard key={e.uri} image={pickImage(e.images)} title={e.name} subtitle={e.podcast?.name} meta={fmtDuration(e.duration_ms)} badge={e.explicit ? "E" : null} />} />
      <CrateRow n="06" title="Podcast" items={data.podcasts} render={(p) => <EntityCard key={p.uri} image={pickImage(p.images)} title={p.name} subtitle={p.publisher} />} />
      <CrateRow n="07" title="Genre" items={data.genres} render={(g) => <EntityCard key={g.uri} image={pickImage(g.images)} title={g.name} />} />
      <CrateRow n="08" title="Pengguna" items={data.users} render={(u) => <EntityCard key={u.uri} image={pickImage(u.images)} title={u.display_name || u.username} round />} />
    </div>
  );
}

function ResultRow({ image, round, title, subtitle, meta, badge, onClick, trailing }) {
  return (
    <div className={`result-row ${onClick ? "clickable" : ""}`} onClick={onClick}>
      <div className={`result-row-cover ${round ? "round" : ""}`}>
        {image ? <img src={image} alt="" loading="lazy" /> : <div className="e-cover-fallback">♪</div>}
      </div>
      <div className="result-row-text">
        <div className="result-row-title">{title}{badge && <Chip>{badge}</Chip>}</div>
        {subtitle && <div className="result-row-subtitle">{subtitle}</div>}
      </div>
      {meta && <div className="result-row-meta mono">{meta}</div>}
      {trailing}
    </div>
  );
}

const SEARCH_FILTERS = [
  { key: "all", label: "Semua" },
  { key: "tracks", label: "Lagu" },
  { key: "albums", label: "Album" },
  { key: "artists", label: "Artis" },
  { key: "playlists", label: "Playlist" },
];

function SearchView({ nav }) {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState(null);
  const [filter, setFilter] = useState("all");
  const [modalTrack, setModalTrack] = useState(null);
  const { play } = usePlayer();
  const state = useApiFetch("spotify-search", query);

  const rows = [];
  if (state.status === "success") {
    const d = state.data;
    const wantTracks = filter === "all" || filter === "tracks";
    const wantAlbums = filter === "all" || filter === "albums";
    const wantArtists = filter === "all" || filter === "artists";
    const wantPlaylists = filter === "all" || filter === "playlists";

    if (wantTracks) (d.tracks || []).forEach((t) => rows.push({ kind: "track", data: t }));
    if (wantAlbums) (d.albums || []).forEach((a) => rows.push({ kind: "album", data: a }));
    if (wantArtists) (d.artists || []).forEach((a) => rows.push({ kind: "artist", data: a }));
    if (wantPlaylists) (d.playlists || []).forEach((p) => rows.push({ kind: "playlist", data: p }));
  }

  return (
    <div className="view search-view">
      <h1 className="page-title">Cari</h1>
      <SearchBar value={input} onChange={setInput} onSubmit={(q) => q && setQuery(q)} autoFocus />
      <FilterChips value={filter} onChange={setFilter} options={SEARCH_FILTERS} />

      {!query && (
        <div className="hint-row">
          <span>Coba:</span>
          {["Melukis Senja", "Fynn Jamal", "Budi Doremi"].map((s) => (
            <button key={s} className="hint-chip" onClick={() => { setInput(s); setQuery(s); }}>{s}</button>
          ))}
        </div>
      )}
      {query && state.status === "loading" && <LoadingState label={`Menyisir katalog untuk "${query}"…`} />}
      {query && state.status === "error" && <ErrorState message={state.error} />}
      {query && state.status === "success" && rows.length === 0 && (
        <EmptyState message={`Tidak ada yang cocok dengan "${query}".`} />
      )}
      {query && state.status === "success" && rows.length > 0 && (
        <div className="result-list">
          {rows.map((r, i) => {
            if (r.kind === "track") {
              const t = r.data;
              return (
                <ResultRow
                  key={t.uri || i}
                  image={pickImage(t.album?.images)}
                  title={t.name}
                  subtitle={artistNames(t.artists)}
                  meta={fmtDuration(t.duration_ms)}
                  badge={t.explicit ? "E" : null}
                  onClick={() => nav("track", t.id)}
                  trailing={
                    <div className="result-row-actions">
                      <button
                        className="result-row-play"
                        title="Putar"
                        onClick={(e) => { e.stopPropagation(); play(t.id, t); }}
                      >
                        <i className="fa-solid fa-play"></i>
                      </button>
                      <button
                        className="result-row-add"
                        title="Tambah ke playlist"
                        onClick={(e) => { e.stopPropagation(); setModalTrack(t); }}
                      >
                        +
                      </button>
                    </div>
                  }
                />
              );
            }
            if (r.kind === "album") {
              const a = r.data;
              return (
                <ResultRow key={a.uri || i} image={pickImage(a.images)} title={a.name} subtitle={`Album · ${artistNames(a.artists)}`} onClick={() => nav("album", a.id)} />
              );
            }
            if (r.kind === "artist") {
              const a = r.data;
              return <ResultRow key={a.uri || i} image={pickImage(a.images)} round title={a.name} subtitle="Artis" onClick={() => nav("artist", a.id)} />;
            }
            const p = r.data;
            return (
              <ResultRow key={p.uri || i} image={pickImage(p.images)} title={p.name} subtitle={p.owner?.display_name ? `Playlist · oleh ${p.owner.display_name}` : "Playlist"} onClick={() => nav("playlist", p.id)} />
            );
          })}
        </div>
      )}

      {modalTrack && <AddToPlaylistModal track={modalTrack} onClose={() => setModalTrack(null)} />}
    </div>
  );
}

function TrackDetailView({ id, nav }) {
  const { play } = usePlayer();
  const [showAddModal, setShowAddModal] = useState(false);
  const state = useApiFetch("spotify-track", id);
  if (state.status === "loading" || state.status === "idle") return <LoadingState />;
  if (state.status === "error") return <ErrorState message={state.error} />;
  const t = state.data;
  const cover = pickImage(t.album?.images, 500);

  return (
    <div className="view sleeve-view">
      <div className="sleeve">
        <div className="sleeve-art">
          {cover ? <img src={cover} alt="" /> : <div className="e-cover-fallback big">♪</div>}
        </div>
        <div className="sleeve-info">
          <Chip tone="accent">Lagu</Chip>
          <h1>{t.name}</h1>
          <p className="sleeve-artists">{artistNames(t.artists)}</p>
          <div className="track-line">
            <span className="track-n">A1</span>
            <span className="track-title">{t.name}</span>
            {t.explicit && <Chip>E</Chip>}
            <span className="track-dur mono">{fmtDuration(t.duration_ms)}</span>
          </div>
          <div className="meta-grid">
            <div><span className="meta-label">Album</span><button className="link" onClick={() => nav("album", t.album?.id)}>{t.album?.name || "—"}</button></div>
            <div><span className="meta-label">Diputar</span><span className="mono">{fmtNumber(t.playcount)}×</span></div>
            <div><span className="meta-label">Nomor trek</span><span className="mono">{t.track_number || "—"}</span></div>
          </div>
          <div className="artist-links">
            {t.artists.map((a) => <button key={a.uri} className="pill" onClick={() => nav("artist", a.id)}>{a.name}</button>)}
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button className="cta" onClick={() => play(t.id, t)}><i className="fa-solid fa-play"></i> Putar Lagu</button>
            <button className="cta" style={{ background: "var(--surface-2)" }} onClick={() => setShowAddModal(true)}>+ Tambah ke Playlist</button>
            <button className="cta" style={{ background: "var(--surface-2)" }} onClick={() => nav("card", t.id)}>Bikin kartu bagikan ↗</button>
          </div>
        </div>
      </div>
      {showAddModal && <AddToPlaylistModal track={t} onClose={() => setShowAddModal(false)} />}
    </div>
  );
}

function AlbumDetailView({ id, nav }) {
  const state = useApiFetch("spotify-album", `spotify:album:${id}`);
  if (state.status === "loading" || state.status === "idle") return <LoadingState />;
  if (state.status === "error") return <ErrorState message={state.error} />;
  const a = state.data;
  const cover = pickImage(a.images, 500);

  return (
    <div className="view sleeve-view">
      <div className="sleeve">
        <div className="sleeve-art">
          {cover ? <img src={cover} alt="" /> : <div className="e-cover-fallback big">♪</div>}
        </div>
        <div className="sleeve-info">
          <Chip tone="accent">{a.type || "Album"}</Chip>
          <h1>{a.name}</h1>
          <p className="sleeve-artists">{artistNames(a.artists)}</p>
          <div className="meta-grid">
            <div><span className="meta-label">Rilis</span><span className="mono">{a.release_date || "—"}</span></div>
            <div><span className="meta-label">Label</span><span>{a.label || "—"}</span></div>
            <div><span className="meta-label">Trek</span><span className="mono">{a.tracks?.length || 0}</span></div>
          </div>
          <div className="artist-links">
            {a.artists.map((ar) => <button key={ar.uri} className="pill" onClick={() => nav("artist", ar.id)}>{ar.name}</button>)}
          </div>
        </div>
      </div>

      <section className="tracklist">
        <CatalogLabel n="B">Daftar Trek</CatalogLabel>
        {a.tracks.map((t, i) => (
          <button key={t.uri} className="track-line row-btn" onClick={() => nav("track", t.id)}>
            <span className="track-n mono">{(i + 1).toString().padStart(2, "0")}</span>
            <span className="track-title">{t.name}</span>
            {t.explicit && <Chip>E</Chip>}
            <span className="track-dur mono">{fmtDuration(t.duration_ms)}</span>
          </button>
        ))}
      </section>

      {a.copyrights?.length > 0 && <p className="fine-print">{a.copyrights.map((c) => c.text).join(" · ")}</p>}
    </div>
  );
}

function ArtistDetailView({ id, nav }) {
  const state = useApiFetch("spotify-artist", id);
  if (state.status === "loading" || state.status === "idle") return <LoadingState />;
  if (state.status === "error") return <ErrorState message={state.error} />;
  const a = state.data;
  const avatar = pickImage(a.images, 400);

  return (
    <div className="view">
      <div className="artist-hero">
        <div className="artist-avatar">
          {avatar ? <img src={avatar} alt="" /> : <div className="e-cover-fallback big round">♪</div>}
        </div>
        <div>
          <div className="artist-name-row">
            <h1>{a.name}</h1>
            {a.verified && <Chip tone="accent">Terverifikasi</Chip>}
          </div>
          <div className="meta-grid">
            <div><span className="meta-label">Pengikut</span><span className="mono">{fmtNumber(a.statistics?.followers)}</span></div>
            <div><span className="meta-label">Pendengar bulanan</span><span className="mono">{fmtNumber(a.statistics?.monthly_listeners)}</span></div>
          </div>
        </div>
      </div>

      <section className="tracklist">
        <CatalogLabel n="C">Lagu Populer</CatalogLabel>
        {a.top_tracks.map((t, i) => (
          <button key={t.uri} className="track-line row-btn" onClick={() => nav("track", t.id)}>
            <span className="track-n mono">{(i + 1).toString().padStart(2, "0")}</span>
            {pickImage(t.album?.images) && <img className="row-thumb" src={pickImage(t.album?.images)} alt="" />}
            <span className="track-title">{t.name}</span>
            <span className="track-dur mono">{fmtNumber(t.playcount)}×</span>
          </button>
        ))}
      </section>
    </div>
  );
}

function PlaylistDetailView({ id, nav }) {
  const state = useApiFetch("spotify-playlist", id);
  if (state.status === "loading" || state.status === "idle") return <LoadingState />;
  if (state.status === "error") return <ErrorState message={state.error} />;
  const p = state.data;
  const cover = pickImage(p.images, 500);

  return (
    <div className="view sleeve-view">
      <div className="sleeve">
        <div className="sleeve-art">
          {cover ? <img src={cover} alt="" /> : <div className="e-cover-fallback big">♪</div>}
        </div>
        <div className="sleeve-info">
          <Chip tone="accent">Playlist</Chip>
          <h1>{p.name}</h1>
          {p.description && <p className="sleeve-desc">{p.description.replace(/<[^>]+>/g, "")}</p>}
          <div className="meta-grid">
            <div><span className="meta-label">Kurator</span><span>{p.owner?.display_name || "—"}</span></div>
            <div><span className="meta-label">Trek</span><span className="mono">{p.tracks?.length || 0}</span></div>
          </div>
        </div>
      </div>

      <section className="tracklist">
        <CatalogLabel n="D">Isi Playlist</CatalogLabel>
        {p.tracks.map((t, i) => (
          <button key={t.uri} className="track-line row-btn" onClick={() => nav("track", t.id)}>
            <span className="track-n mono">{(i + 1).toString().padStart(2, "0")}</span>
            {pickImage(t.album?.images) && <img className="row-thumb" src={pickImage(t.album?.images)} alt="" />}
            <span className="track-title">{t.name}<span className="track-sub"> — {artistNames(t.artists)}</span></span>
            {t.explicit && <Chip>E</Chip>}
            <span className="track-dur mono">{fmtDuration(t.duration_ms)}</span>
          </button>
        ))}
      </section>
    </div>
  );
}

/* ====================== Library (playlist lokal) ====================== */
function LibraryView({ nav }) {
  const { playlists, createPlaylist } = usePlaylists();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const handleCreate = (e) => {
    e.preventDefault();
    const id = createPlaylist(name);
    setName("");
    setCreating(false);
    if (id) nav("mylist", id);
  };

  return (
    <div className="view">
      <h1 className="page-title">Library</h1>

      {!creating ? (
        <button className="library-new-btn" onClick={() => setCreating(true)}>+ Buat Playlist Baru</button>
      ) : (
        <form className="library-new-form" onSubmit={handleCreate}>
          <input autoFocus placeholder="Nama playlist…" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit" disabled={!name.trim()}>Buat</button>
          <button type="button" className="library-new-cancel" onClick={() => { setCreating(false); setName(""); }}>Batal</button>
        </form>
      )}

      {playlists.length === 0 ? (
        <EmptyState message="Belum ada playlist" />
      ) : (
        <div className="library-grid">
          {playlists.map((p) => {
            const cover = pickImage(p.tracks[0]?.album?.images);
            return (
              <EntityCard
                key={p.id}
                image={cover}
                title={p.name}
                subtitle={`${p.tracks.length} lagu`}
                onClick={() => nav("mylist", p.id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function MyPlaylistView({ id, nav }) {
  const { playlists, deletePlaylist, removeTrackFromPlaylist } = usePlaylists();
  const { play, playQueue } = usePlayer();
  const playlist = playlists.find((p) => p.id === id);

  if (!playlist) return <EmptyState message="Playlist tidak ditemukan." />;
  const cover = pickImage(playlist.tracks[0]?.album?.images, 500);

  return (
    <div className="view sleeve-view">
      <div className="sleeve">
        <div className="sleeve-art">
          {cover ? <img src={cover} alt="" /> : <div className="e-cover-fallback big">♪</div>}
        </div>
        <div className="sleeve-info">
          <Chip tone="accent">Playlist Saya</Chip>
          <h1>{playlist.name}</h1>
          <p className="sleeve-artists">{playlist.tracks.length} lagu</p>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {playlist.tracks[0] && (
              <button className="cta" onClick={() => playQueue(playlist.tracks, 0)}><i className="fa-solid fa-play"></i> Putar Semua</button>
            )}
            <button
              className="cta"
              style={{ background: "var(--surface-2)" }}
              onClick={() => { deletePlaylist(playlist.id); nav("library"); }}
            >
              <i className="fa-solid fa-trash"></i> Hapus Playlist
            </button>
          </div>
        </div>
      </div>

      <section className="tracklist">
        <CatalogLabel n="P">Isi Playlist</CatalogLabel>
        {playlist.tracks.length === 0 && <EmptyState message="Belum ada lagu di playlist ini." />}
        {playlist.tracks.map((t, i) => (
          <div key={t.id} className="track-line">
            <button className="result-row-add" title="Putar dari sini" onClick={() => playQueue(playlist.tracks, i)}><i className="fa-solid fa-play"></i></button>
            {pickImage(t.album?.images) && <img className="row-thumb" src={pickImage(t.album?.images)} alt="" />}
            <button className="track-title link" style={{ textAlign: "left" }} onClick={() => nav("track", t.id)}>{t.name}<span className="track-sub"> — {artistNames(t.artists)}</span></button>
            <span className="track-dur mono">{fmtDuration(t.duration_ms)}</span>
            <button className="result-row-add" title="Hapus dari playlist" onClick={() => removeTrackFromPlaylist(playlist.id, t.id)}><i className="fa-solid fa-xmark"></i></button>
          </div>
        ))}
      </section>
    </div>
  );
}

/* ====================== Info ====================== */
function InfoView() {
  const { canInstall, installed, platform, promptInstall } = useInstallPrompt();

  return (
    <div className="view">
      <h1 className="page-title">Info</h1>
      <div className="info-block">
        <VinylDisc size={64} />
        <div>
          <h2 className="info-heading">PIRINGAN</h2>
          <p className="hero-sub" style={{ margin: "6px 0 0" }}>
            Katalog metadata musik — lagu, album, artis, dan playlist disusun seperti krat piringan hitam.
          </p>
        </div>
      </div>

      <section className="install-section">
        {installed ? (
          <div className="install-status">
            <i className="fa-solid fa-circle-check"></i>
            <span>Piringan sudah terpasang di perangkat kamu.</span>
          </div>
        ) : canInstall ? (
          <button className="cta install-btn" onClick={promptInstall}>
            <i className="fa-solid fa-arrow-down-to-line"></i> Pasang ke Layar Utama
          </button>
        ) : platform === "ios" ? (
          <div className="install-hint">
            <p className="install-hint-title"><i className="fa-solid fa-mobile-screen-button"></i> Pasang di iPhone/iPad</p>
            <p className="install-hint-text">
              Ketuk tombol <strong>Bagikan</strong> <i className="fa-solid fa-arrow-up-from-bracket"></i> di Safari, lalu pilih <strong>"Tambah ke Layar Utama"</strong>.
            </p>
          </div>
        ) : (
          <div className="install-hint">
            <p className="install-hint-title"><i className="fa-solid fa-desktop"></i> Pasang Piringan</p>
            <p className="install-hint-text">
              Buka menu browser (⋮) lalu pilih <strong>"Instal aplikasi"</strong> atau <strong>"Tambahkan ke layar utama"</strong>.
            </p>
          </div>
        )}
      </section>

      <ul className="info-list">
        <li>Gunakan tab <strong>Search</strong> untuk menelusuri katalog.</li>
        <li>Tekan tombol <strong>+</strong> pada sebuah lagu untuk menambahkannya ke playlist.</li>
        <li>Kelola playlist kamu lewat tab <strong>Library</strong>.</li>
        <li>Ketuk mini player untuk membuka tampilan Now Playing.</li>
      </ul>
      <p className="fine-print">Piringan · katalog metadata, bukan pemutar. Musiknya tetap ada di rumahnya.</p>
    </div>
  );
}

/* ====================== Card Maker ====================== */
function CardMakerView({ presetId, nav }) {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState(null);
  const [pickedId, setPickedId] = useState(presetId || null);
  const searchState = useApiFetch("spotify-search", query);
  const trackState = useApiFetch("spotify-track", pickedId);
  const canvasRef = useRef(null);
  const [bgColor, setBgColor] = useState("#2A241E");

  useEffect(() => {
    if (trackState.status !== "success") return;
    const cover = pickImage(trackState.data.album?.images, 300);
    if (!cover) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = 16; c.height = 16;
        const cx = c.getContext("2d");
        cx.drawImage(img, 0, 0, 16, 16);
        const d = cx.getImageData(0, 0, 16, 16).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
        r = Math.floor(r / n * 0.55);
        g = Math.floor(g / n * 0.55);
        b = Math.floor(b / n * 0.55);
        setBgColor(`rgb(${r},${g},${b})`);
      } catch (e) { setBgColor("#2A241E"); }
    };
    img.onerror = () => setBgColor("#2A241E");
    img.src = cover;
  }, [trackState.status, trackState.data]);

  const downloadCard = useCallback(() => {
    const t = trackState.data;
    if (!t) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const W = 640, H = 840;
    canvas.width = W; canvas.height = H;
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, W, H);

    const cardX = 40, cardY = 40, cardW = W - 80, cardH = H - 80, r = 28;
    ctx.fillStyle = "rgba(20,17,14,0.72)";
    roundRect(ctx, cardX, cardY, cardW, cardH, r);
    ctx.fill();

    const drawRest = (coverImg) => {
      const size = 400;
      const cx = cardX + 40, cy = cardY + 40;
      if (coverImg) {
        roundRect(ctx, cx, cy, size, size, 12);
        ctx.save(); ctx.clip();
        ctx.drawImage(coverImg, cx, cy, size, size);
        ctx.restore();
      } else {
        ctx.fillStyle = "#E8532B";
        roundRect(ctx, cx, cy, size, size, 12);
        ctx.fill();
      }
      ctx.fillStyle = "#F3E9D8";
      ctx.font = "700 34px Georgia, serif";
      wrapCanvasText(ctx, t.name, cx, cy + size + 56, size, 40);
      ctx.fillStyle = "rgba(243,233,216,0.72)";
      ctx.font = "500 22px sans-serif";
      ctx.fillText(artistNames(t.artists), cx, cy + size + 100);
      ctx.fillStyle = "rgba(243,233,216,0.5)";
      ctx.font = "600 16px monospace";
      ctx.fillText("PIRINGAN · " + fmtDuration(t.duration_ms), cx, cardY + cardH - 30);
      const link = document.createElement("a");
      link.download = `${t.name.replace(/[^a-z0-9]/gi, "_")}-piringan.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    };

    const cover = pickImage(t.album?.images, 400);
    if (!cover) { drawRest(null); return; }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => drawRest(img);
    img.onerror = () => drawRest(null);
    img.src = cover;
  }, [trackState.data, bgColor]);

  return (
    <div className="view">
      <div className="hero small">
        <h1>Bikin kartu bagikan</h1>
        <p className="hero-sub">Cari lagu, lalu unduh kartunya sebagai gambar.</p>
        <SearchBar value={input} onChange={setInput} onSubmit={(q) => q && setQuery(q)} />
      </div>
      {query && searchState.status === "loading" && <LoadingState />}
      {query && searchState.status === "success" && (
        <div className="crate-scroll">
          {(searchState.data.tracks || []).slice(0, 8).map((t) => (
            <EntityCard key={t.uri} image={pickImage(t.album?.images)} title={t.name} subtitle={artistNames(t.artists)} onClick={() => setPickedId(t.id)} />
          ))}
        </div>
      )}
      {pickedId && trackState.status === "loading" && <LoadingState label="Menyiapkan kartu…" />}
      {pickedId && trackState.status === "success" && (
        <div className="card-preview-wrap">
          <div className="card-preview" style={{ background: bgColor }}>
            <div className="card-preview-inner">
              <div className="card-preview-cover">
                {pickImage(trackState.data.album?.images, 300) ? <img src={pickImage(trackState.data.album?.images, 300)} alt="" /> : <div className="e-cover-fallback">♪</div>}
              </div>
              <div className="card-preview-title">{trackState.data.name}</div>
              <div className="card-preview-artist">{artistNames(trackState.data.artists)}</div>
              <div className="card-preview-brand">PIRINGAN · {fmtDuration(trackState.data.duration_ms)}</div>
            </div>
          </div>
          <button className="cta" onClick={downloadCard}>Unduh sebagai gambar ↓</button>
          <canvas ref={canvasRef} style={{ display: "none" }} />
        </div>
      )}
    </div>
  );
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = (text || "").split(" ");
  let line = "";
  let cy = y;
  const lines = [];
  for (const w of words) {
    const test = line + w + " ";
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy);
      lines.push(line);
      line = w + " ";
      cy += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, cy);
  lines.push(line);
  return lines;
}

/* ====================== Mini Player (diperbarui) ====================== */
function MiniPlayer() {
  const { track, loading, playing, ready, togglePlay, stop, setSheetOpen } = usePlayer();

  // Jika tidak ada track, tidak tampil
  if (!track) return null;

  return (
    <div className="mini-player">
      <button className="mini-player-info" onClick={() => setSheetOpen(true)}>
        {track.cover ? <img src={track.cover} alt="" /> : <div className="mini-player-cover-fallback">♪</div>}
        <div className="mini-player-text">
          <div className="mini-player-title">{track.title}</div>
          <div className="mini-player-artist">{track.artist}</div>
        </div>
      </button>
      <div className="mini-player-controls">
        {loading ? (
          <span className="mini-player-loading">Memuat…</span>
        ) : (
          <>
            <button onClick={togglePlay} disabled={!ready}>
              <i className={`fa-solid ${playing ? "fa-pause" : "fa-play"}`}></i>
            </button>
            <button className="mini-player-close" onClick={stop}><i className="fa-solid fa-xmark"></i></button>
          </>
        )}
      </div>
    </div>
  );
}

/* ====================== Now Playing (tampilan penuh) ====================== */
function NowPlayingSheet() {
  const { track, sheetOpen, setSheetOpen, playing, ready, loading, currentTime, duration, togglePlay, stop, seek, next, previous, hasNext, hasPrevious } = usePlayer();
  const [showAddModal, setShowAddModal] = useState(false);

  if (!sheetOpen || !track) return null;

  const pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className="now-playing">
      <div className="now-playing-head">
        <button className="now-playing-collapse" onClick={() => setSheetOpen(false)}><i className="fa-solid fa-chevron-down"></i></button>
        <div className="now-playing-eyebrow">
          <span>SEDANG DIPUTAR</span>
          <strong>{track.artist}</strong>
        </div>
        <button className="now-playing-add" title="Tambah ke playlist" onClick={() => setShowAddModal(true)}>+</button>
      </div>

      <div className="now-playing-art">
        {track.cover ? <img src={track.cover} alt="" /> : <div className="e-cover-fallback big">♪</div>}
      </div>

      <div className="now-playing-meta">
        <h2>{track.title}</h2>
        <p>{track.artist}</p>
      </div>

      <div className="now-playing-progress">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          onChange={(e) => seek(parseFloat(e.target.value))}
          disabled={!ready}
          style={{ "--pct": `${pct}%` }}
        />
        <div className="now-playing-times mono">
          <span>{fmtDuration(currentTime * 1000)}</span>
          <span>{fmtDuration((duration || 0) * 1000)}</span>
        </div>
      </div>

      <div className="now-playing-controls">
        <button className="now-playing-skip" onClick={previous} disabled={!hasPrevious}><i className="fa-solid fa-backward-step"></i></button>
        <button className="now-playing-play" onClick={togglePlay} disabled={!ready}>
          {loading ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className={`fa-solid ${playing ? "fa-pause" : "fa-play"}`}></i>}
        </button>
        <button className="now-playing-skip" onClick={next} disabled={!hasNext}><i className="fa-solid fa-forward-step"></i></button>
      </div>
      <button className="now-playing-stop" onClick={stop} style={{ marginTop: 14 }}><i className="fa-solid fa-stop"></i> Berhenti</button>

      {showAddModal && <AddToPlaylistModal track={track} onClose={() => setShowAddModal(false)} />}
    </div>
  );
}

/* ====================== Navigasi Bawah ====================== */
const NAV_ITEMS = [
  { key: "home", label: "Home", icon: "fa-house" },
  { key: "search", label: "Search", icon: "fa-magnifying-glass" },
  { key: "card", label: "Card", icon: "fa-id-card" },
  { key: "library", label: "Library", icon: "fa-bars-staggered" },
  { key: "info", label: "Info", icon: "fa-circle-info" },
];

function BottomNav({ current, nav }) {
  return (
    <nav className="bottom-nav">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.key}
          className={`bottom-nav-btn ${current === item.key ? "active" : ""}`}
          onClick={() => nav(item.key)}
        >
          <span className="bottom-nav-icon"><i className={`fa-solid ${item.icon}`}></i></span>
          <span className="bottom-nav-label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

/* ====================== App Shell ====================== */
const TAB_OF = { home: "home", search: "search", card: "card", library: "library", info: "info", mylist: "library" };

const TAB_NAMES = ["home", "search", "card", "library", "info"];

function AppShell() {
  const { track } = usePlayer();
  const [view, setView] = useState({ name: "home" });
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("SW gagal daftar:", err));
    }
  }, []);

  const nav = (name, id) => {
    if (!id && !["home", "card", "search", "library", "info"].includes(name)) return;
    window.scrollTo({ top: 0, behavior: "smooth" });
    setHistory((h) => (TAB_NAMES.includes(name) ? [] : [...h, view]));
    setView({ name, id });
  };

  const goBack = () => {
    if (!history.length) { nav("home"); return; }
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    window.scrollTo({ top: 0, behavior: "smooth" });
    setView(prev);
  };

  const activeTab = TAB_OF[view.name] || null;
  const hasMiniPlayer = !!track;
  const isDetailView = !TAB_NAMES.includes(view.name);

  return (
    <div className="app">
      <Fonts />

      <main className={hasMiniPlayer ? "has-mini-player" : ""}>
        {isDetailView && (
          <button className="back-btn" onClick={goBack}>← Kembali</button>
        )}
        {view.name === "home" && <HomeView nav={nav} />}
        {view.name === "search" && <SearchView nav={nav} />}
        {view.name === "library" && <LibraryView nav={nav} />}
        {view.name === "mylist" && <MyPlaylistView id={view.id} nav={nav} />}
        {view.name === "info" && <InfoView />}
        {view.name === "track" && <TrackDetailView id={view.id} nav={nav} />}
        {view.name === "album" && <AlbumDetailView id={view.id} nav={nav} />}
        {view.name === "artist" && <ArtistDetailView id={view.id} nav={nav} />}
        {view.name === "playlist" && <PlaylistDetailView id={view.id} nav={nav} />}
        {view.name === "card" && <CardMakerView presetId={view.id} nav={nav} />}
      </main>

      <MiniPlayer />
      <BottomNav current={activeTab} nav={nav} />
      <NowPlayingSheet />

      <Styles />
    </div>
  );
}

export default function App() {
  return (
    <InstallProvider>
      <PlayerProvider>
        <PlaylistProvider>
          <AppShell />
        </PlaylistProvider>
      </PlayerProvider>
    </InstallProvider>
  );
}

/* ====================== Fonts & Styles ====================== */
function Fonts() {
  return (
    <>
      <link rel="manifest" href="/manifest.json" />
      <link
        rel="stylesheet"
        href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
      />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,500&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
      `}</style>
    </>
  );
}

function Styles() {
  return (
    <style>{`
      :root {
        --bg: #14110E;
        --surface: #1E1A16;
        --surface-2: #241F1A;
        --text: #F3E9D8;
        --text-muted: #9C9184;
        --accent: #E8532B;
        --accent-2: #4F8C7A;
        --line: #332C25;
      }
      * { box-sizing: border-box; }
      .app { background: var(--bg); color: var(--text); min-height: 100vh; font-family: 'Inter', sans-serif; display: flex; flex-direction: column; }
      .mono { font-family: 'IBM Plex Mono', monospace; }

      .disc { animation: spin 3s linear infinite; }
      @keyframes spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }
      @media (prefers-reduced-motion: reduce) { .disc { animation: none; } }

      .topbar {
        position: sticky; top: 0; z-index: 10;
        display: flex; align-items: center; justify-content: space-between;
        padding: 16px 28px;
        background: rgba(20,17,14,0.9); backdrop-filter: blur(8px);
        border-bottom: 1px solid var(--line);
      }
      .brand {
        display: flex; align-items: center; gap: 10px;
        background: none; border: none; cursor: pointer;
        color: var(--text); font-family: 'Fraunces', serif; font-weight: 700; font-size: 20px; letter-spacing: 0.02em;
      }
      .topnav { display: flex; gap: 4px; }
      .topnav button {
        background: none; border: none; color: var(--text-muted);
        font-family: 'Inter'; font-size: 14px; padding: 8px 14px; border-radius: 999px; cursor: pointer;
      }
      .topnav button.active, .topnav button:hover { color: var(--text); background: var(--surface); }

      main { flex: 1; max-width: 1080px; margin: 0 auto; width: 100%; padding: 24px 28px calc(84px + env(safe-area-inset-bottom, 0px)); }
      main.has-mini-player { padding-bottom: calc(150px + env(safe-area-inset-bottom, 0px)); }

      .page-title { font-family: 'Fraunces', serif; font-weight: 600; font-size: 34px; margin: 4px 0 20px; }

      .back-btn {
        background: none; border: none; color: var(--text-muted); cursor: pointer;
        font-family: 'Inter'; font-size: 14px; padding: 6px 0 18px; display: inline-flex; align-items: center;
      }
      .back-btn:hover { color: var(--text); }

      .hero { text-align: center; padding: 64px 0 40px; display: flex; flex-direction: column; align-items: center; gap: 18px; }
      .hero.small { padding: 40px 0 24px; }
      .hero h1 {
        font-family: 'Fraunces', serif; font-weight: 600; font-size: clamp(32px, 5vw, 52px);
        margin: 0; max-width: 640px; line-height: 1.1;
      }
      .hero h1 em { color: var(--accent); font-style: italic; }
      .hero-sub { color: var(--text-muted); max-width: 480px; margin: 0; }

      .search-bar {
        display: flex; align-items: center; gap: 8px;
        background: var(--surface); border: 1px solid var(--line); border-radius: 999px;
        padding: 6px 6px 6px 18px; width: 100%; max-width: 520px;
      }
      .search-icon { color: var(--text-muted); }
      .search-bar input {
        flex: 1; background: none; border: none; outline: none; color: var(--text);
        font-family: 'Inter'; font-size: 15px; padding: 10px 0;
      }
      .search-bar button {
        background: var(--accent); color: #14110E; border: none; border-radius: 999px;
        padding: 10px 20px; font-weight: 600; cursor: pointer; font-family: 'Inter';
      }
      .search-bar button:hover { filter: brightness(1.08); }

      .hint-row { display: flex; gap: 10px; align-items: center; justify-content: center; margin-top: 8px; color: var(--text-muted); font-size: 14px; flex-wrap: wrap; }
      .hint-chip { background: var(--surface); border: 1px solid var(--line); color: var(--text); border-radius: 999px; padding: 6px 14px; cursor: pointer; font-family: 'Inter'; }
      .hint-chip:hover { border-color: var(--accent); }

      .state-block { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 60px 0; color: var(--text-muted); }
      .state-error { color: #D98B7A; }
      .state-icon { font-size: 22px; }

      .crates { display: flex; flex-direction: column; gap: 36px; margin-top: 24px; }
      .catalog-label { display: flex; align-items: baseline; gap: 10px; margin-bottom: 14px; }
      .catalog-n { font-family: 'IBM Plex Mono'; color: var(--accent); font-size: 13px; }
      .catalog-t { font-family: 'Fraunces', serif; font-weight: 600; font-size: 19px; letter-spacing: 0.01em; }

      .crate-scroll { display: flex; gap: 16px; overflow-x: auto; padding-bottom: 8px; scrollbar-width: thin; }

      .e-card {
        flex: 0 0 150px; background: none; border: none; color: var(--text); cursor: pointer;
        text-align: left; padding: 0; font-family: 'Inter';
      }
      .e-card:disabled { cursor: default; }
      .e-cover {
        width: 150px; height: 150px; border-radius: 8px; overflow: hidden;
        background: var(--surface-2); border: 1px solid var(--line); position: relative;
        transition: transform 0.15s ease;
      }
      .e-cover.round { border-radius: 50%; }
      .e-cover.big { width: 100%; height: 100%; }
      .e-card:not(:disabled):hover .e-cover { transform: translateY(-3px); border-color: var(--accent); }
      .e-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .e-cover-fallback { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 32px; color: var(--text-muted); }
      .e-cover-fallback.big { font-size: 64px; }
      .e-badge {
        position: absolute; top: 6px; right: 6px; background: rgba(20,17,14,0.85);
        font-family: 'IBM Plex Mono'; font-size: 10px; padding: 2px 5px; border-radius: 4px;
      }
      .e-title { margin-top: 8px; font-size: 14px; font-weight: 600; line-height: 1.3;
        overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
      .e-subtitle { font-size: 12.5px; color: var(--text-muted); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .e-meta { font-size: 11.5px; color: var(--text-muted); font-family: 'IBM Plex Mono'; margin-top: 2px; }

      .chip {
        display: inline-block; font-family: 'IBM Plex Mono'; font-size: 11px; padding: 3px 8px;
        border-radius: 5px; background: var(--surface-2); color: var(--text-muted); border: 1px solid var(--line);
      }
      .chip-accent { background: rgba(232,83,43,0.15); color: var(--accent); border-color: transparent; }

      .view { padding-top: 20px; }
      .sleeve-view { padding-top: 40px; }
      .sleeve { display: flex; gap: 40px; align-items: flex-start; flex-wrap: wrap; }
      .sleeve-art {
        width: 280px; height: 280px; flex-shrink: 0; border-radius: 10px; overflow: hidden;
        border: 1px solid var(--line); background: var(--surface-2);
        box-shadow: 12px 16px 0 -6px rgba(0,0,0,0.3), 0 20px 40px rgba(0,0,0,0.4);
        transform: rotate(-1.2deg);
      }
      .sleeve-art img { width: 100%; height: 100%; object-fit: cover; }
      .sleeve-info { flex: 1; min-width: 280px; display: flex; flex-direction: column; gap: 12px; }
      .sleeve-info h1 { font-family: 'Fraunces', serif; font-size: 36px; margin: 4px 0 0; line-height: 1.1; }
      .sleeve-artists { color: var(--text-muted); margin: 0; font-size: 16px; }
      .sleeve-desc { color: var(--text-muted); font-size: 14px; margin: 0; }

      .meta-grid { display: flex; gap: 28px; flex-wrap: wrap; margin: 6px 0; }
      .meta-grid > div { display: flex; flex-direction: column; gap: 3px; }
      .meta-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); }
      .link { background: none; border: none; color: var(--accent-2); cursor: pointer; padding: 0; font-family: 'Inter'; font-size: 15px; text-align: left; }
      .link:hover { color: var(--accent); }

      .artist-links { display: flex; gap: 8px; flex-wrap: wrap; }
      .pill { background: var(--surface); border: 1px solid var(--line); color: var(--text); border-radius: 999px; padding: 6px 14px; cursor: pointer; font-size: 13px; }
      .pill:hover { border-color: var(--accent); }

      .cta {
        align-self: flex-start; margin-top: 8px; background: var(--accent); color: #14110E; border: none;
        border-radius: 999px; padding: 12px 22px; font-weight: 600; cursor: pointer; font-family: 'Inter';
      }
      .cta:hover { filter: brightness(1.08); }

      .track-line { display: flex; align-items: center; gap: 14px; padding: 10px 4px; border-bottom: 1px solid var(--line); }
      .row-btn { width: 100%; background: none; border: none; cursor: pointer; color: var(--text); font-family: 'Inter'; text-align: left; }
      .row-btn:hover { background: var(--surface); }
      .track-n { color: var(--text-muted); width: 28px; flex-shrink: 0; font-size: 13px; }
      .row-thumb { width: 36px; height: 36px; border-radius: 4px; object-fit: cover; flex-shrink: 0; }
      .track-title { flex: 1; font-size: 14.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .track-sub { color: var(--text-muted); font-weight: 400; }
      .track-dur { color: var(--text-muted); font-size: 13px; flex-shrink: 0; }

      .tracklist { margin-top: 44px; }
      .fine-print { color: var(--text-muted); font-size: 12px; margin-top: 18px; }

      .artist-hero { display: flex; gap: 28px; align-items: center; padding-top: 20px; flex-wrap: wrap; }
      .artist-avatar { width: 200px; height: 200px; border-radius: 50%; overflow: hidden; border: 1px solid var(--line); flex-shrink: 0; }
      .artist-avatar img { width: 100%; height: 100%; object-fit: cover; }
      .artist-name-row { display: flex; align-items: center; gap: 10px; }
      .artist-name-row h1 { font-family: 'Fraunces', serif; font-size: 38px; margin: 0; }

      .card-preview-wrap { display: flex; flex-direction: column; align-items: center; gap: 20px; margin-top: 30px; }
      .card-preview {
        width: 320px; height: 420px; border-radius: 20px; position: relative; overflow: hidden;
        display: flex; align-items: center; justify-content: center;
        transition: background 0.4s ease;
      }
      .card-preview-inner {
        width: 280px; height: 380px; border-radius: 14px; background: rgba(20,17,14,0.72);
        display: flex; flex-direction: column; padding: 20px; gap: 6px;
      }
      .card-preview-cover { width: 100%; height: 200px; border-radius: 10px; overflow: hidden; background: var(--surface-2); }
      .card-preview-cover img { width: 100%; height: 100%; object-fit: cover; }
      .card-preview-title { font-family: 'Fraunces', serif; font-weight: 700; font-size: 20px; margin-top: 12px; line-height: 1.2; }
      .card-preview-artist { color: rgba(243,233,216,0.75); font-size: 14px; }
      .card-preview-brand { margin-top: auto; font-family: 'IBM Plex Mono'; font-size: 12px; color: rgba(243,233,216,0.5); }

      /* MINI PLAYER */
      .mini-player {
        position: fixed; left: 0; right: 0;
        bottom: calc(64px + env(safe-area-inset-bottom, 0px));
        background: var(--surface); border-top: 1px solid var(--line);
        padding: 8px 16px;
        display: flex; align-items: center; justify-content: space-between;
        backdrop-filter: blur(8px); z-index: 25;
        gap: 12px;
      }
      .mini-player-info {
        display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1;
        background: none; border: none; padding: 4px; cursor: pointer; text-align: left; color: var(--text);
      }
      .mini-player-info img, .mini-player-cover-fallback {
        width: 40px; height: 40px; border-radius: 6px; object-fit: cover; flex-shrink: 0;
      }
      .mini-player-cover-fallback { display: flex; align-items: center; justify-content: center; background: var(--surface-2); color: var(--text-muted); }
      .mini-player-text { min-width: 0; }
      .mini-player-title { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; }
      .mini-player-artist { font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; }
      .mini-player-controls { display: flex; gap: 8px; flex-shrink: 0; align-items: center; }
      .mini-player-loading { font-size: 13px; color: var(--accent); font-style: italic; }
      .mini-player-controls button {
        background: var(--accent); color: #14110E; border: none;
        border-radius: 50%; width: 36px; height: 36px; cursor: pointer; font-weight: 600;
        font-size: 14px; display: flex; align-items: center; justify-content: center;
      }
      .mini-player-controls .mini-player-close { background: var(--surface-2); color: var(--text); }
      .mini-player-controls button:disabled { opacity: 0.5; cursor: default; }

      .footer { text-align: center; padding: 24px; color: var(--text-muted); font-size: 12.5px; border-top: 1px solid var(--line); }

      /* BOTTOM NAV */
      .bottom-nav {
        position: fixed; bottom: 0; left: 0; right: 0;
        padding-bottom: env(safe-area-inset-bottom, 0px);
        background: rgba(20,17,14,0.96); backdrop-filter: blur(10px);
        border-top: 1px solid var(--line);
        display: flex; z-index: 30;
      }
      .bottom-nav-btn {
        flex: 1; background: none; border: none; color: var(--text-muted); cursor: pointer;
        display: flex; flex-direction: column; align-items: center; gap: 3px;
        padding: 9px 4px 8px; font-family: 'Inter';
      }
      .bottom-nav-icon { font-size: 19px; line-height: 1; }
      .bottom-nav-label { font-size: 11px; }
      .bottom-nav-btn.active { color: var(--accent); }

      /* FILTER CHIPS */
      .filter-chips { display: flex; gap: 8px; overflow-x: auto; margin: 16px 0 20px; scrollbar-width: none; }
      .filter-chips::-webkit-scrollbar { display: none; }
      .filter-chip {
        flex-shrink: 0; background: var(--surface); border: 1px solid var(--line); color: var(--text-muted);
        border-radius: 999px; padding: 8px 18px; cursor: pointer; font-family: 'Inter'; font-size: 14px;
      }
      .filter-chip.active { background: var(--text); color: #14110E; border-color: var(--text); font-weight: 600; }

      /* RESULT LIST (baris vertikal) */
      .result-row-actions { display: flex; gap: 8px; flex-shrink: 0; }
      .result-row-play {
        width: 30px; height: 30px; border-radius: 50%; border: none;
        background: var(--accent); color: #14110E; font-size: 13px; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
      }
      .result-row-play:hover { filter: brightness(1.08); }

      .result-list { display: flex; flex-direction: column; }
      .result-row {
        display: flex; align-items: center; gap: 14px; padding: 10px 6px;
        border-radius: 10px; cursor: default;
      }
      .result-row.clickable { cursor: pointer; }
      .result-row.clickable:hover { background: var(--surface); }
      .result-row-cover {
        width: 52px; height: 52px; border-radius: 8px; overflow: hidden; flex-shrink: 0;
        background: var(--surface-2); border: 1px solid var(--line);
      }
      .result-row-cover.round { border-radius: 50%; }
      .result-row-cover img { width: 100%; height: 100%; object-fit: cover; }
      .result-row-text { flex: 1; min-width: 0; }
      .result-row-title { font-weight: 700; font-size: 15.5px; display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .result-row-subtitle { color: var(--text-muted); font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .result-row-meta { color: var(--text-muted); font-size: 12.5px; flex-shrink: 0; }
      .result-row-add {
        flex-shrink: 0; width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--line);
        background: var(--surface-2); color: var(--text); font-size: 16px; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
      }
      .result-row-add:hover { border-color: var(--accent); color: var(--accent); }

      /* NOW PLAYING (layar penuh) */
      .now-playing {
        position: fixed; inset: 0; z-index: 40;
        background: linear-gradient(180deg, #1B1713 0%, #100D0A 100%);
        display: flex; flex-direction: column; align-items: center;
        padding: 18px 24px calc(28px + env(safe-area-inset-bottom, 0px));
        overflow-y: auto;
      }
      .now-playing-head {
        width: 100%; max-width: 420px; display: flex; align-items: center; justify-content: space-between; gap: 12px;
      }
      .now-playing-collapse, .now-playing-add {
        background: var(--surface-2); border: 1px solid var(--line); color: var(--text);
        width: 36px; height: 36px; border-radius: 50%; font-size: 18px; cursor: pointer;
        display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      }
      .now-playing-eyebrow { text-align: center; display: flex; flex-direction: column; gap: 2px; }
      .now-playing-eyebrow span { font-size: 11px; letter-spacing: 0.08em; color: var(--text-muted); }
      .now-playing-eyebrow strong { font-size: 14px; font-weight: 600; }
      .now-playing-art {
        width: min(78vw, 340px); height: min(78vw, 340px); margin-top: 28px; border-radius: 14px; overflow: hidden;
        background: var(--surface-2); border: 1px solid var(--line); box-shadow: 0 20px 50px rgba(0,0,0,0.45);
      }
      .now-playing-art img { width: 100%; height: 100%; object-fit: cover; }
      .now-playing-meta { text-align: center; margin-top: 26px; max-width: 420px; }
      .now-playing-meta h2 { font-family: 'Fraunces', serif; font-size: 24px; margin: 0; }
      .now-playing-meta p { color: var(--text-muted); margin: 6px 0 0; }
      .now-playing-progress { width: 100%; max-width: 420px; margin-top: 22px; }
      .now-playing-progress input[type="range"] {
        width: 100%; appearance: none; height: 4px; border-radius: 999px; cursor: pointer;
        background: linear-gradient(to right, var(--accent) 0%, var(--accent) var(--pct, 0%), var(--surface-2) var(--pct, 0%), var(--surface-2) 100%);
      }
      .now-playing-progress input[type="range"]::-webkit-slider-thumb {
        appearance: none; width: 13px; height: 13px; border-radius: 50%; background: var(--text); cursor: pointer;
      }
      .now-playing-times { display: flex; justify-content: space-between; font-size: 12px; color: var(--text-muted); margin-top: 6px; }
      .now-playing-controls { display: flex; align-items: center; gap: 18px; margin-top: 26px; }
      .now-playing-play {
        width: 68px; height: 68px; border-radius: 50%; background: var(--accent); color: #14110E;
        border: none; font-size: 24px; cursor: pointer; display: flex; align-items: center; justify-content: center;
      }
      .now-playing-play:disabled { opacity: 0.6; }
      .now-playing-skip {
        background: var(--surface-2); border: 1px solid var(--line); color: var(--text);
        width: 44px; height: 44px; border-radius: 50%; font-size: 17px; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
      }
      .now-playing-skip:disabled { opacity: 0.35; cursor: default; }
      .now-playing-stop {
        background: var(--surface-2); border: 1px solid var(--line); color: var(--text);
        border-radius: 999px; padding: 12px 20px; cursor: pointer; font-weight: 600; font-size: 13.5px;
      }

      /* MODAL: TAMBAH KE PLAYLIST */
      .modal-backdrop {
        position: fixed; inset: 0; background: rgba(10,8,6,0.6); z-index: 50;
        display: flex; align-items: flex-end; justify-content: center;
      }
      .modal-card {
        width: 100%; max-width: 480px; background: var(--surface); border: 1px solid var(--line);
        border-radius: 20px 20px 0 0; padding: 22px 22px calc(22px + env(safe-area-inset-bottom, 0px));
        max-height: 76vh; overflow-y: auto;
      }
      .modal-head { display: flex; align-items: center; justify-content: space-between; }
      .modal-head h3 { font-family: 'Fraunces', serif; margin: 0; font-size: 20px; }
      .modal-close { background: var(--surface-2); border: 1px solid var(--line); color: var(--text); width: 30px; height: 30px; border-radius: 50%; cursor: pointer; }
      .modal-track-name { color: var(--text-muted); font-size: 13.5px; margin: 4px 0 16px; }
      .modal-playlist-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
      .modal-playlist-row {
        display: flex; justify-content: space-between; align-items: center; background: var(--surface-2);
        border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; cursor: pointer; color: var(--text); font-family: 'Inter';
      }
      .modal-playlist-row:disabled { opacity: 0.6; cursor: default; }
      .modal-playlist-count { font-size: 12px; color: var(--text-muted); }
      .modal-new-playlist { display: flex; gap: 8px; }
      .modal-new-playlist input {
        flex: 1; background: var(--surface-2); border: 1px solid var(--line); border-radius: 10px;
        padding: 11px 14px; color: var(--text); font-family: 'Inter'; outline: none;
      }
      .modal-new-playlist button {
        background: var(--accent); color: #14110E; border: none; border-radius: 10px;
        padding: 0 16px; font-weight: 600; cursor: pointer; white-space: nowrap;
      }
      .modal-new-playlist button:disabled { opacity: 0.5; cursor: default; }

      /* LIBRARY */
      .library-new-btn {
        width: 100%; background: var(--surface); border: 1px solid var(--line); color: var(--text);
        border-radius: 12px; padding: 14px; font-weight: 600; cursor: pointer; margin-bottom: 24px; font-family: 'Inter';
      }
      .library-new-form { display: flex; gap: 8px; margin-bottom: 24px; }
      .library-new-form input {
        flex: 1; background: var(--surface); border: 1px solid var(--line); border-radius: 10px;
        padding: 12px 14px; color: var(--text); font-family: 'Inter'; outline: none;
      }
      .library-new-form button { background: var(--accent); color: #14110E; border: none; border-radius: 10px; padding: 0 16px; font-weight: 600; cursor: pointer; }
      .library-new-cancel { background: var(--surface-2) !important; color: var(--text) !important; }
      .library-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 18px; }

      /* INFO */
      .info-block { display: flex; align-items: center; gap: 18px; margin-bottom: 24px; }
      .info-heading { font-family: 'Fraunces', serif; font-size: 22px; margin: 0; letter-spacing: 0.02em; }
      .info-list { color: var(--text-muted); font-size: 14.5px; line-height: 2; padding-left: 20px; margin: 0 0 24px; }
      .info-list strong { color: var(--text); }

      .install-section { margin-bottom: 28px; }
      .install-btn { display: inline-flex; align-items: center; gap: 10px; }
      .install-status {
        display: flex; align-items: center; gap: 10px; color: var(--accent-2);
        background: rgba(79,140,122,0.12); border: 1px solid rgba(79,140,122,0.35);
        border-radius: 12px; padding: 12px 16px; font-size: 14px;
      }
      .install-hint {
        background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px;
      }
      .install-hint-title { display: flex; align-items: center; gap: 8px; font-weight: 700; margin: 0 0 6px; }
      .install-hint-text { color: var(--text-muted); font-size: 13.5px; margin: 0; line-height: 1.6; }

      @media (max-width: 640px) {
        main { padding: 20px 16px calc(84px + env(safe-area-inset-bottom, 0px)); }
        main.has-mini-player { padding-bottom: calc(150px + env(safe-area-inset-bottom, 0px)); }
        .sleeve-art { width: 100%; height: 320px; }
        .mini-player { padding: 8px 12px; }
        .now-playing-art { width: 82vw; height: 82vw; }
      }
    `}</style>
  );
}
