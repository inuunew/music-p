import { useState, useEffect, useRef, useCallback } from "react";

const API = "https://api.inuutyz.web.id/api/search";

/* ---------- helpers ---------- */

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
  const url = `${API}/${endpoint}?q=${encodeURIComponent(q)}`;
  const res = await fetch(url);
  const json = await res.json();
  if (!json || !json.status || !json.result) {
    throw new Error("Data tidak ditemukan di katalog.");
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

/* ---------- signature visual: vinyl disc ---------- */

function VinylDisc({ size = 40, spinning = false, cover = null }) {
  return (
    <div
      className="disc"
      style={{ width: size, height: size, animationPlayState: spinning ? "running" : "paused" }}
    >
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

/* ---------- small ui atoms ---------- */

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

/* ---------- cards ---------- */

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

/* ---------- search ---------- */

function SearchBar({ value, onChange, onSubmit, autoFocus }) {
  return (
    <form
      className="search-bar"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(value.trim());
      }}
    >
      <span className="search-icon">⌕</span>
      <input
        autoFocus={autoFocus}
        placeholder="Cari lagu, album, artis, atau playlist…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="submit">Cari</button>
    </form>
  );
}

/* ---------- views ---------- */

function HomeView({ nav }) {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState(null);
  const state = useApiFetch("spotify-search", query);

  return (
    <div className="view">
      <div className="hero">
        <VinylDisc size={84} spinning={state.status === "loading"} />
        <h1>
          Buka sampul, <em>putar sesuatu</em>.
        </h1>
        <p className="hero-sub">
          Telusuri katalog Spotify — lagu, album, artis, dan playlist — disusun seperti krat piringan hitam.
        </p>
        <SearchBar
          value={input}
          onChange={setInput}
          onSubmit={(q) => q && setQuery(q)}
          autoFocus
        />
      </div>

      {query && state.status === "loading" && <LoadingState label={`Menyisir katalog untuk "${query}"…`} />}
      {query && state.status === "error" && <ErrorState message={state.error} />}
      {query && state.status === "success" && (
        <ResultsCrates data={state.data} query={query} nav={nav} />
      )}
      {!query && (
        <div className="hint-row">
          <span>Coba:</span>
          {["Melukis Senja", "Fynn Jamal", "Budi Doremi"].map((s) => (
            <button key={s} className="hint-chip" onClick={() => { setInput(s); setQuery(s); }}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ResultsCrates({ data, query, nav }) {
  const anyResults =
    (data.top_results && data.top_results.length) ||
    (data.tracks && data.tracks.length) ||
    (data.albums && data.albums.length) ||
    (data.artists && data.artists.length) ||
    (data.playlists && data.playlists.length) ||
    (data.episodes && data.episodes.length) ||
    (data.podcasts && data.podcasts.length) ||
    (data.genres && data.genres.length) ||
    (data.users && data.users.length);

  if (!anyResults) return <EmptyState message={`Tidak ada yang cocok dengan "${query}".`} />;

  return (
    <div className="crates">
      <CrateRow
        n="00"
        title="Hasil Teratas"
        items={data.top_results}
        render={(item, i) => {
          const clickable = ["Track", "Album", "Artist", "Playlist"].includes(item.type);
          return (
            <EntityCard
              key={item.uri + i}
              image={pickImage(item.images)}
              title={item.name || "Tanpa nama"}
              subtitle={item.type}
              round={item.type === "Artist"}
              onClick={clickable ? () => nav(item.type.toLowerCase(), item.id) : undefined}
            />
          );
        }}
      />
      <CrateRow
        n="01"
        title="Lagu"
        items={data.tracks}
        render={(t) => (
          <EntityCard
            key={t.uri}
            image={pickImage(t.album?.images)}
            title={t.name}
            subtitle={artistNames(t.artists)}
            meta={fmtDuration(t.duration_ms)}
            badge={t.explicit ? "E" : null}
            onClick={() => nav("track", t.id)}
          />
        )}
      />
      <CrateRow
        n="02"
        title="Album"
        items={data.albums}
        render={(a) => (
          <EntityCard
            key={a.uri}
            image={pickImage(a.images)}
            title={a.name}
            subtitle={`${artistNames(a.artists)} · ${a.release_year || "—"}`}
            meta={a.type}
            onClick={() => nav("album", a.id)}
          />
        )}
      />
      <CrateRow
        n="03"
        title="Artis"
        items={data.artists}
        render={(a) => (
          <EntityCard
            key={a.uri}
            image={pickImage(a.images)}
            title={a.name}
            round
            onClick={() => nav("artist", a.id)}
          />
        )}
      />
      <CrateRow
        n="04"
        title="Playlist"
        items={data.playlists}
        render={(p) => (
          <EntityCard
            key={p.uri}
            image={pickImage(p.images)}
            title={p.name}
            subtitle={p.owner?.display_name ? `oleh ${p.owner.display_name}` : null}
            onClick={() => nav("playlist", p.id)}
          />
        )}
      />
      <CrateRow
        n="05"
        title="Episode"
        items={data.episodes}
        render={(e) => (
          <EntityCard
            key={e.uri}
            image={pickImage(e.images)}
            title={e.name}
            subtitle={e.podcast?.name}
            meta={fmtDuration(e.duration_ms)}
            badge={e.explicit ? "E" : null}
          />
        )}
      />
      <CrateRow
        n="06"
        title="Podcast"
        items={data.podcasts}
        render={(p) => (
          <EntityCard key={p.uri} image={pickImage(p.images)} title={p.name} subtitle={p.publisher} />
        )}
      />
      <CrateRow
        n="07"
        title="Genre"
        items={data.genres}
        render={(g) => <EntityCard key={g.uri} image={pickImage(g.images)} title={g.name} />}
      />
      <CrateRow
        n="08"
        title="Pengguna"
        items={data.users}
        render={(u) => (
          <EntityCard key={u.uri} image={pickImage(u.images)} title={u.display_name || u.username} round />
        )}
      />
    </div>
  );
}

function TrackDetailView({ id, nav }) {
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
            <div>
              <span className="meta-label">Album</span>
              <button className="link" onClick={() => nav("album", t.album?.id)}>
                {t.album?.name || "—"}
              </button>
            </div>
            <div>
              <span className="meta-label">Diputar</span>
              <span className="mono">{fmtNumber(t.playcount)}×</span>
            </div>
            <div>
              <span className="meta-label">Nomor trek</span>
              <span className="mono">{t.track_number || "—"}</span>
            </div>
          </div>
          <div className="artist-links">
            {t.artists.map((a) => (
              <button key={a.uri} className="pill" onClick={() => nav("artist", a.id)}>
                {a.name}
              </button>
            ))}
          </div>
          <button className="cta" onClick={() => nav("card", t.id)}>
            Bikin kartu bagikan ↗
          </button>
        </div>
      </div>
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
            <div>
              <span className="meta-label">Rilis</span>
              <span className="mono">{a.release_date || "—"}</span>
            </div>
            <div>
              <span className="meta-label">Label</span>
              <span>{a.label || "—"}</span>
            </div>
            <div>
              <span className="meta-label">Trek</span>
              <span className="mono">{a.tracks?.length || 0}</span>
            </div>
          </div>
          <div className="artist-links">
            {a.artists.map((ar) => (
              <button key={ar.uri} className="pill" onClick={() => nav("artist", ar.id)}>
                {ar.name}
              </button>
            ))}
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

      {a.copyrights?.length > 0 && (
        <p className="fine-print">{a.copyrights.map((c) => c.text).join(" · ")}</p>
      )}
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
            <div>
              <span className="meta-label">Pengikut</span>
              <span className="mono">{fmtNumber(a.statistics?.followers)}</span>
            </div>
            <div>
              <span className="meta-label">Pendengar bulanan</span>
              <span className="mono">{fmtNumber(a.statistics?.monthly_listeners)}</span>
            </div>
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
          {p.description && <p className="sleeve-artists" dangerouslySetInnerHTML={{ __html: "" }} />}
          {p.description && <p className="sleeve-desc">{p.description.replace(/<[^>]+>/g, "")}</p>}
          <div className="meta-grid">
            <div>
              <span className="meta-label">Kurator</span>
              <span>{p.owner?.display_name || "—"}</span>
            </div>
            <div>
              <span className="meta-label">Trek</span>
              <span className="mono">{p.tracks?.length || 0}</span>
            </div>
          </div>
        </div>
      </div>

      <section className="tracklist">
        <CatalogLabel n="D">Isi Playlist</CatalogLabel>
        {p.tracks.map((t, i) => (
          <button key={t.uri} className="track-line row-btn" onClick={() => nav("track", t.id)}>
            <span className="track-n mono">{(i + 1).toString().padStart(2, "0")}</span>
            {pickImage(t.album?.images) && <img className="row-thumb" src={pickImage(t.album?.images)} alt="" />}
            <span className="track-title">
              {t.name}
              <span className="track-sub"> — {artistNames(t.artists)}</span>
            </span>
            {t.explicit && <Chip>E</Chip>}
            <span className="track-dur mono">{fmtDuration(t.duration_ms)}</span>
          </button>
        ))}
      </section>
    </div>
  );
}

/* ---------- card maker (browser-side, no server render) ---------- */

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
        c.width = 16;
        c.height = 16;
        const cx = c.getContext("2d");
        cx.drawImage(img, 0, 0, 16, 16);
        const d = cx.getImageData(0, 0, 16, 16).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) {
          r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
        }
        r = Math.floor(r / n * 0.55);
        g = Math.floor(g / n * 0.55);
        b = Math.floor(b / n * 0.55);
        setBgColor(`rgb(${r},${g},${b})`);
      } catch (e) {
        setBgColor("#2A241E");
      }
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
    canvas.width = W;
    canvas.height = H;

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
        ctx.save();
        ctx.clip();
        ctx.drawImage(coverImg, cx, cy, size, size);
        ctx.restore();
      } else {
        ctx.fillStyle = "#E8532B";
        roundRect(ctx, cx, cy, size, size, 12);
        ctx.fill();
      }

      ctx.fillStyle = "#F3E9D8";
      ctx.font = "700 34px Georgia, serif";
      wrapCanvasText(ctx, t.name, cx, cy + size + 56, size, 40).forEach(() => {});

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
    if (!cover) {
      drawRest(null);
      return;
    }
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
            <EntityCard
              key={t.uri}
              image={pickImage(t.album?.images)}
              title={t.name}
              subtitle={artistNames(t.artists)}
              onClick={() => setPickedId(t.id)}
            />
          ))}
        </div>
      )}

      {pickedId && trackState.status === "loading" && <LoadingState label="Menyiapkan kartu…" />}
      {pickedId && trackState.status === "success" && (
        <div className="card-preview-wrap">
          <div className="card-preview" style={{ background: bgColor }}>
            <div className="card-preview-inner">
              <div className="card-preview-cover">
                {pickImage(trackState.data.album?.images, 300) ? (
                  <img src={pickImage(trackState.data.album?.images, 300)} alt="" />
                ) : (
                  <div className="e-cover-fallback">♪</div>
                )}
              </div>
              <div className="card-preview-title">{trackState.data.name}</div>
              <div className="card-preview-artist">{artistNames(trackState.data.artists)}</div>
              <div className="card-preview-brand">PIRINGAN · {fmtDuration(trackState.data.duration_ms)}</div>
            </div>
          </div>
          <button className="cta" onClick={downloadCard}>
            Unduh sebagai gambar ↓
          </button>
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

/* ---------- app shell ---------- */

export default function App() {
  const [view, setView] = useState({ name: "home" });

  const nav = (name, id) => {
    if (!id && name !== "home" && name !== "card") return;
    window.scrollTo({ top: 0, behavior: "smooth" });
    setView({ name, id });
  };

  return (
    <div className="app">
      <Fonts />
      <header className="topbar">
        <button className="brand" onClick={() => nav("home")}>
          <VinylDisc size={28} />
          <span>PIRINGAN</span>
        </button>
        <nav className="topnav">
          <button className={view.name === "home" ? "active" : ""} onClick={() => nav("home")}>
            Beranda
          </button>
          <button className={view.name === "card" ? "active" : ""} onClick={() => nav("card")}>
            Bikin Kartu
          </button>
        </nav>
      </header>

      <main>
        {view.name === "home" && <HomeView nav={nav} />}
        {view.name === "track" && <TrackDetailView id={view.id} nav={nav} />}
        {view.name === "album" && <AlbumDetailView id={view.id} nav={nav} />}
        {view.name === "artist" && <ArtistDetailView id={view.id} nav={nav} />}
        {view.name === "playlist" && <PlaylistDetailView id={view.id} nav={nav} />}
        {view.name === "card" && <CardMakerView presetId={view.id} nav={nav} />}
      </main>

      <footer className="footer">
        <span>Piringan · katalog metadata, bukan pemutar. Musiknya tetap ada di rumahnya.</span>
      </footer>

      <Styles />
    </div>
  );
}

function Fonts() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,500&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
    `}</style>
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
      .app {
        background: var(--bg);
        color: var(--text);
        min-height: 100vh;
        font-family: 'Inter', sans-serif;
        display: flex;
        flex-direction: column;
      }
      .mono { font-family: 'IBM Plex Mono', monospace; }

      .disc { animation: spin 3s linear infinite; }
      @keyframes spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }
      @media (prefers-reduced-motion: reduce) { .disc { animation: none; } }

      .topbar {
        position: sticky; top: 0; z-index: 10;
        display: flex; align-items: center; justify-content: space-between;
        padding: 16px 28px;
        background: rgba(20,17,14,0.9);
        backdrop-filter: blur(8px);
        border-bottom: 1px solid var(--line);
      }
      .brand {
        display: flex; align-items: center; gap: 10px;
        background: none; border: none; cursor: pointer;
        color: var(--text);
        font-family: 'Fraunces', serif; font-weight: 700; font-size: 20px; letter-spacing: 0.02em;
      }
      .topnav { display: flex; gap: 4px; }
      .topnav button {
        background: none; border: none; color: var(--text-muted);
        font-family: 'Inter'; font-size: 14px; padding: 8px 14px; border-radius: 999px; cursor: pointer;
      }
      .topnav button.active, .topnav button:hover { color: var(--text); background: var(--surface); }

      main { flex: 1; max-width: 1080px; margin: 0 auto; width: 100%; padding: 0 28px 80px; }

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

      .track-line {
        display: flex; align-items: center; gap: 14px; padding: 10px 4px; border-bottom: 1px solid var(--line);
      }
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

      .footer { text-align: center; padding: 24px; color: var(--text-muted); font-size: 12.5px; border-top: 1px solid var(--line); }

      @media (max-width: 640px) {
        .topbar { padding: 14px 16px; }
        main { padding: 0 16px 60px; }
        .sleeve-art { width: 100%; height: 320px; }
      }
    `}</style>
  );
}
