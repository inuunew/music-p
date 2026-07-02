import React, { useState } from 'react';
import * as spotifyApi from './services/spotifyServices';
import ApiResultCard from './components/ApiResultCard';

const App = () => {
  // State manajemen data hasil API
  const [searchData, setSearchData] = useState(null);
  const [trackData, setTrackData] = useState(null);
  const [artistData, setArtistData] = useState(null);
  const [albumData, setAlbumData] = useState(null);
  const [playlistData, setPlaylistData] = useState(null);
  const [downloadData, setDownloadData] = useState(null);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Fungsi Wrapper otomatis untuk handling Loading, Error, dan State Data
  const handleApiCall = async (apiFunc, setDataFunc) => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFunc();
      setDataFunc(data);
    } catch (err) {
      console.error(err);
      setError('Terjadi kesalahan saat memanggil API.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ borderBottom: '2px solid #eee', marginBottom: '20px', paddingBottom: '10px' }}>
        <h1 style={{ margin: 0, color: '#1DB954' }}>Spotify API Tester (InuuTyzDev)</h1>
        <p style={{ color: '#666' }}>Klik tombol di bawah untuk menguji respon dari keenam endpoint API:</p>
      </header>

      {/* Baris Tombol Aksi */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '25px' }}>
        <button onClick={() => handleApiCall(spotifyApi.fetchSearch, setSearchData)} disabled={loading} style={buttonStyle}>1. Test Search</button>
        <button onClick={() => handleApiCall(spotifyApi.fetchTrack, setTrackData)} disabled={loading} style={buttonStyle}>2. Test Track</button>
        <button onClick={() => handleApiCall(spotifyApi.fetchArtist, setArtistData)} disabled={loading} style={buttonStyle}>3. Test Artist</button>
        <button onClick={() => handleApiCall(spotifyApi.fetchAlbum, setAlbumData)} disabled={loading} style={buttonStyle}>4. Test Album</button>
        <button onClick={() => handleApiCall(spotifyApi.fetchPlaylist, setPlaylistData)} disabled={loading} style={buttonStyle}>5. Test Playlist</button>
        <button onClick={() => handleApiCall(spotifyApi.fetchDownload, setDownloadData)} disabled={loading} style={buttonStyle}>6. Test Download</button>
      </div>

      {/* Indikator Loading dan Error */}
      {loading && <p style={{ color: '#007bff', fontWeight: 'bold' }}>⏳ Sedang memuat data dari API...</p>}
      {error && <p style={{ color: 'red', fontWeight: 'bold' }}>⚠️ {error}</p>}

      {/* Grid Grid Hasil Tampilan Teks JSON */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '20px' }}>
        <ApiResultCard 
          title="1. Search Result (Top Results)" 
          data={searchData} 
          renderCustom={(data) => JSON.stringify(data.result?.top_results, null, 2)} 
        />
        
        <ApiResultCard 
          title="2. Track Result" 
          data={trackData} 
          renderCustom={(data) => JSON.stringify(data.result, null, 2)} 
        />

        <ApiResultCard 
          title="3. Artist Result" 
          data={artistData} 
          renderCustom={(data) => `${data.result?.name || 'Tidak Diketahui'} - Followers: ${data.result?.statistics?.followers || 0}`} 
        />

        <ApiResultCard 
          title="4. Album Result" 
          data={albumData} 
          renderCustom={(data) => JSON.stringify(data.result?.name, null, 2)} 
        />

        <ApiResultCard 
          title="5. Playlist Result" 
          data={playlistData} 
          renderCustom={(data) => JSON.stringify(data.result?.name, null, 2)} 
        />

        <ApiResultCard 
          title="6. Download Result" 
          data={downloadData} 
        />
      </div>
    </div>
  );
};

// Style sederhana untuk tombol agar terlihat rapi
const buttonStyle = {
  padding: '10px 16px',
  borderRadius: '20px',
  border: 'none',
  backgroundColor: '#1DB954',
  color: 'white',
  fontWeight: 'bold',
  cursor: 'pointer',
  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  transition: 'background 0.2s'
};

export default App;
