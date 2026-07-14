var AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg', '.wma'];
var LOCAL_MUSIC_DIR = 'music';
var NVIDIA_API_KEY = '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';
/* RAPIDAPI_KEY available for future use: e9f2c625ebmsh6cd2de7109f2f5ep1f9991jsn4f3b636412b2 */

window.pickFolder = async function() {
  try {
    if ('showDirectoryPicker' in window) {
      var dirHandle = await window.showDirectoryPicker();
      return await loadFromDirectoryHandle(dirHandle);
    }
  } catch (err) {
    if (err.name === 'AbortError' || err.name === 'SecurityError') return null;
  }
  return null;
};

window.pickFolderFallback = function() {
  return new Promise(function(resolve) {
    var input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.multiple = true;
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('change', function() {
      document.body.removeChild(input);
      if (input.files.length === 0) { resolve(null); return; }
      var folderName = input.files[0].webkitRelativePath.split('/')[0] || 'MUSIC FOLDER';
      var files = Array.from(input.files).filter(function(f) {
        return AUDIO_EXTENSIONS.some(function(ext) { return f.name.toLowerCase().endsWith(ext); });
      });
      resolve({ folderName: folderName, files: files });
    }, { once: true });

    input.click();
  });
};

async function loadFromDirectoryHandle(dirHandle) {
  var entries = [];
  for await (var entry of dirHandle.values()) {
    if (entry.kind === 'file') {
      if (AUDIO_EXTENSIONS.some(function(ext) { return entry.name.toLowerCase().endsWith(ext); })) {
        entries.push(entry);
      }
    }
  }
  var files = [];
  for (var i = 0; i < entries.length; i++) {
    files.push(await entries[i].getFile());
  }
  return { folderName: dirHandle.name, files: files };
}

window.processAudioFiles = async function(files, onProgress) {
  var songs = [];
  var total = files.length;

  for (var i = 0; i < total; i += 5) {
    var batch = files.slice(i, i + 5);
    var promises = batch.map(function(file, idx) { return processFile(file, i + idx); });
    var results = await Promise.allSettled(promises);
    results.forEach(function(r) {
      if (r.status === 'fulfilled' && r.value) songs.push(r.value);
    });
    if (onProgress) onProgress(Math.min(songs.length, total), total);
  }

  return songs;
};

async function processFile(file, index) {
  var blobUrl = URL.createObjectURL(file);

  var song = {
    id: 'song-' + Date.now() + '-' + index + '-' + Math.random().toString(36).slice(2, 8),
    title: window.stripExtension(file.name),
    artist: 'UNKNOWN ARTIST',
    album: 'UNKNOWN ALBUM',
    duration: 0,
    trackNo: 0,
    year: '',
    genre: '',
    blobUrl: blobUrl,
    albumArtUrl: null,
    fileName: file.name
  };

  try {
    var tags = await readId3Tags(file);
    if (tags) {
      if (tags.title) song.title = tags.title;
      if (tags.artist) song.artist = tags.artist;
      if (tags.album) song.album = tags.album;
      if (tags.trackNo) song.trackNo = tags.trackNo;
      if (tags.picture) song.albumArtUrl = tags.picture;
      if (tags.year) song.year = tags.year;
      if (tags.genre) song.genre = tags.genre;
    }
  } catch (e) {}

  song.duration = await getAudioDuration(blobUrl);
  return song;
}

function readId3Tags(file) {
  return new Promise(function(resolve) {
    try {
      if (typeof jsmediatags === 'undefined') { resolve(null); return; }
      jsmediatags.read(file, {
        onSuccess: function(result) {
          var tags = result.tags || {};
          var picture = tags.picture;
          var albumArtUrl = null;

          if (picture && picture.data) {
            try {
              var bytes = new Uint8Array(picture.data);
              var blob = new Blob([bytes], { type: picture.format || 'image/jpeg' });
              albumArtUrl = URL.createObjectURL(blob);
            } catch (e) {}
          }

          resolve({
            title: tags.title,
            artist: tags.artist,
            album: tags.album,
            trackNo: tags.track,
            year: tags.year,
            genre: tags.genre,
            picture: albumArtUrl
          });
        },
        onError: function() { resolve(null); }
      });
    } catch (e) { resolve(null); }
  });
}

/* ---------- LOCAL MUSIC DIRECTORY SCAN ---------- */

/* ---------- INTERNET METADATA (NVIDIA AI + album art) ---------- */

window.fetchAIMetadata = async function(title, artist) {
  if (!title) return null;

  var callModel = async function(model, bodyExtra) {
    var controller = new AbortController();
    var timeout = setTimeout(function() { controller.abort(); }, 30000);

    try {
      var resp = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + NVIDIA_API_KEY
        },
        body: JSON.stringify(Object.assign({
          model: model,
          messages: [
            {
              role: 'system',
              content: 'You are a music database. Extract song metadata from your training data. Respond with ONLY valid JSON. No other text or markdown.'
            },
            {
              role: 'user',
              content: 'Song: "' + title.replace(/"/g, "'") + '"\nArtist: ' + (artist && artist !== 'UNKNOWN ARTIST' ? artist.replace(/"/g, "'") : 'unknown') + '\n\nReturn JSON with these exact fields:\n{\n  "year": "YYYY",\n  "genre": "genre1, genre2",\n  "album": "Album Name"\n}\n\nIf unknown use empty string. Only output JSON.'
            }
          ],
          max_tokens: 256,
          temperature: 0.1,
          stream: false
        }, bodyExtra || {}))
      });

      clearTimeout(timeout);
      if (!resp.ok) { console.warn('AI ' + model + ' HTTP', resp.status); return null; }

      var data = await resp.json();
      var text = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '';
      var match = text.match(/\{[\s\S]*\}/);
      if (match) {
        var parsed = JSON.parse(match[0]);
        return {
          year: String(parsed.year || ''),
          genre: String(parsed.genre || ''),
          album: String(parsed.album || '')
        };
      }
      return null;
    } catch (e) {
      clearTimeout(timeout);
      if (e.name === 'AbortError') { return 'TIMEOUT'; }
      console.warn('AI ' + model + ' error:', e);
      return null;
    }
  };

  /* Primary: Llama 3.2 3B (proven 0.4s response, fast & reliable) */
  var result = await callModel('meta/llama-3.2-3b-instruct');
  if (result && result !== 'TIMEOUT') return result;

  /* Fallback: Gemma 4 31B (slower cold-start, user's preferred) */
  console.warn('Llama 3.2 3B ' + (result === 'TIMEOUT' ? 'timed out' : 'failed') + ' \u2192 trying Gemma 4 31B');
  return await callModel('google/gemma-4-31b-it', {
    top_p: 0.95,
    temperature: 1.0,
    chat_template_kwargs: { enable_thinking: true }
  });
};

window.fetchAlbumArtFromInternet = async function(title, artist, album) {
  if (!title && !album) return null;

  var searchITunes = async function(term) {
    try {
      var resp = await fetch('https://itunes.apple.com/search?term=' + encodeURIComponent(term) + '&entity=song&limit=3&country=US', { signal: AbortSignal.timeout(10000) });
      if (!resp.ok) return null;
      var data = await resp.json();
      if (data.results && data.results.length > 0) {
        var artUrl = data.results[0].artworkUrl100;
        if (artUrl) return artUrl.replace('100x100bb', '600x600bb');
      }
    } catch (e) {
      if (e.name !== 'TimeoutError') console.warn('iTunes search error:', e);
    }
    return null;
  };

  /* Strategy 1: search by album + artist (most accurate) */
  if (album) {
    var byAlbum = (album + ' ' + (artist || '')).trim();
    var url = await searchITunes(byAlbum);
    if (url) { console.log('Album art found via album search:', byAlbum); return url; }
  }

  /* Strategy 2: search by title + artist */
  var byTitle = (title + ' ' + (artist || '')).trim();
  var url2 = await searchITunes(byTitle);
  if (url2) { console.log('Album art found via title search:', byTitle); return url2; }

  /* Strategy 3: Cover Art Archive via MusicBrainz (fallback when iTunes has nothing) */
  if (album) {
    var url3 = await window.fetchAlbumArtFromCoverArtArchive(album, artist);
    if (url3) { console.log('Album art found via Cover Art Archive:', album); return url3; }
  }

  console.warn('No album art found for:', title, artist, album);
  return null;
};

window.fetchAlbumArtFromCoverArtArchive = async function(album, artist) {
  if (!album) return null;
  try {
    var query = 'release:"' + encodeURIComponent(album.replace(/"/g, '')) + '"';
    if (artist && artist !== 'UNKNOWN ARTIST') {
      query += ' AND artist:"' + encodeURIComponent(artist.replace(/"/g, '')) + '"';
    }
    var resp = await fetch('https://musicbrainz.org/ws/2/release?query=' + query + '&fmt=json&limit=3');
    if (!resp.ok) return null;
    var data = await resp.json();
    if (!data.releases || data.releases.length === 0) return null;

    for (var i = 0; i < data.releases.length; i++) {
      var mbid = data.releases[i].id;
      var caaUrl = 'https://coverartarchive.org/release/' + mbid + '/front-500.jpg';
      try {
        var headResp = await fetch(caaUrl, { method: 'HEAD', redirect: 'follow' });
        if (headResp.ok) return caaUrl;
      } catch (e) {}
    }
    return null;
  } catch (e) {
    console.warn('Cover Art Archive error:', e);
    return null;
  }
};

/* ---------- LOCAL MUSIC DIRECTORY SCAN ---------- */

window.scanLocalMusicDir = async function(onProgress) {
  var entries = [];

  /* Try manifest.json first (works on Vercel, GitHub Pages, etc.) */
  try {
    var manifestResp = await fetch('/' + LOCAL_MUSIC_DIR + '/manifest.json');
    if (manifestResp.ok) {
      var manifest = await manifestResp.json();
      if (manifest && manifest.files && manifest.files.length > 0) {
        manifest.files.forEach(function(name) {
          entries.push({
            url: '/' + LOCAL_MUSIC_DIR + '/' + encodeURIComponent(name),
            name: name
          });
        });
      }
    }
  } catch (e) {}

  /* Fall back to directory listing HTML parsing (local dev servers) */
  if (entries.length === 0) {
    try {
      var resp = await fetch('/' + LOCAL_MUSIC_DIR + '/');
      var html = await resp.text();
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var links = doc.querySelectorAll('a[href]');

      links.forEach(function(a) {
        var href = a.getAttribute('href');
        var name = decodeURIComponent(href.split('/').pop() || '');
        if (!name) return;
        var ext = name.toLowerCase().split('.').pop();
        if (ext && AUDIO_EXTENSIONS.some(function(e) { return e.slice(1) === ext; })) {
          var fullUrl = href;
          if (fullUrl.indexOf('://') === -1) {
            fullUrl = '/' + LOCAL_MUSIC_DIR + '/' + href.replace(/^\.\//, '');
          }
          entries.push({ url: fullUrl, name: name });
        }
      });
    } catch (e) {}
  }

  if (entries.length === 0) return null;

  var songs = [];
  var total = entries.length;

  for (var i = 0; i < total; i += 5) {
    var batch = entries.slice(i, i + 5);
    var promises = batch.map(function(entry, idx) { return processUrlFile(entry.url, entry.name, i + idx); });
    var results = await Promise.allSettled(promises);
    results.forEach(function(r) {
      if (r.status === 'fulfilled' && r.value) songs.push(r.value);
    });
    if (onProgress) onProgress(Math.min(songs.length, total), total);
  }

  return { folderName: LOCAL_MUSIC_DIR.toUpperCase(), files: null, songs: songs };
};

async function processUrlFile(url, name, index) {
  var song = {
    id: 'song-' + Date.now() + '-' + index + '-' + Math.random().toString(36).slice(2, 8),
    title: window.stripExtension(name),
    artist: 'UNKNOWN ARTIST',
    album: 'UNKNOWN ALBUM',
    duration: 0,
    trackNo: 0,
    year: '',
    genre: '',
    blobUrl: url,
    albumArtUrl: null,
    fileName: name
  };

  try {
    var tags = await readId3TagsFromUrl(url);
    if (tags) {
      if (tags.title) song.title = tags.title;
      if (tags.artist) song.artist = tags.artist;
      if (tags.album) song.album = tags.album;
      if (tags.trackNo) song.trackNo = tags.trackNo;
      if (tags.picture) song.albumArtUrl = tags.picture;
      if (tags.year) song.year = tags.year;
      if (tags.genre) song.genre = tags.genre;
    }
  } catch (e) {}

  song.duration = await getAudioDuration(url);
  return song;
}

function readId3TagsFromUrl(url) {
  return new Promise(function(resolve) {
    try {
      if (typeof jsmediatags === 'undefined') { resolve(null); return; }
      jsmediatags.read(url, {
        onSuccess: function(result) {
          var tags = result.tags || {};
          var picture = tags.picture;
          var albumArtUrl = null;

          if (picture && picture.data) {
            try {
              var bytes = new Uint8Array(picture.data);
              var blob = new Blob([bytes], { type: picture.format || 'image/jpeg' });
              albumArtUrl = URL.createObjectURL(blob);
            } catch (e) {}
          }

          resolve({
            title: tags.title,
            artist: tags.artist,
            album: tags.album,
            trackNo: tags.track,
            year: tags.year,
            genre: tags.genre,
            picture: albumArtUrl
          });
        },
        onError: function(err) { console.warn('readId3TagsFromUrl fail:', url, err); resolve(null); }
      });
    } catch (e) { console.warn('readId3TagsFromUrl catch:', url, e); resolve(null); }
  });
}

function getAudioDuration(blobUrl) {
  return new Promise(function(resolve) {
    var tempAudio = new Audio();
    var timeout = setTimeout(function() { tempAudio.src = ''; resolve(0); }, 10000);

    tempAudio.addEventListener('loadedmetadata', function() {
      clearTimeout(timeout);
      var dur = tempAudio.duration || 0;
      tempAudio.src = '';
      resolve(dur);
    }, { once: true });

    tempAudio.addEventListener('error', function() {
      clearTimeout(timeout);
      tempAudio.src = '';
      resolve(0);
    }, { once: true });

    tempAudio.preload = 'metadata';
    tempAudio.src = blobUrl;
  });
}
