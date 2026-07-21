var AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg', '.wma'];
var LOCAL_MUSIC_DIR = 'music';

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

  for (var i = 0; i < total; i++) {
    var result = await processFile(files[i], i);
    if (result) songs.push(result);
    if (onProgress) onProgress(Math.min(songs.length, total), total);
  }

  return songs;
};

async function processFile(file, index) {
  var blobUrl = URL.createObjectURL(file);

  var song = {
    id: 'song-' + Date.now() + '-' + index + '-' + Math.random().toString(36).slice(2, 8),
    title: window.stripExtension(file.name),
    duration: 0,
    blobUrl: blobUrl,
    albumArtUrl: null,
    fileName: file.name
  };

  try {
    var tags = await readId3Tags(file);
    if (tags) {
      if (tags.title) song.title = tags.title;
      if (tags.picture) song.albumArtUrl = tags.picture;
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
            picture: albumArtUrl
          });
        },
        onError: function() { resolve(null); }
      });
    } catch (e) { resolve(null); }
  });
}

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

  for (var i = 0; i < total; i++) {
    var result = await processUrlFile(entries[i].url, entries[i].name, i);
    if (result) songs.push(result);
    if (onProgress) onProgress(Math.min(songs.length, total), total);
  }

  return { folderName: LOCAL_MUSIC_DIR.toUpperCase(), files: null, songs: songs };
};

async function processUrlFile(url, name, index) {
  var song = {
    id: 'song-' + Date.now() + '-' + index + '-' + Math.random().toString(36).slice(2, 8),
    title: window.cleanSongTitle(window.stripExtension(name)),
    duration: 0,
    blobUrl: url,
    albumArtUrl: null,
    fileName: name
  };

  try {
    var tags = await readId3TagsFromUrl(url);
    if (tags) {
      if (tags.title) song.title = tags.title;
      if (tags.picture) song.albumArtUrl = tags.picture;
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
            picture: albumArtUrl
          });
        },
        onError: function(err) { console.warn('readId3TagsFromUrl fail:', url, err); resolve(null); }
      });
    } catch (e) { console.warn('readId3TagsFromUrl catch:', url, e); resolve(null); }
  });
}

/* ---------- YOUTUBE THUMBNAIL (only source, no AI) ---------- */

window.fetchAlbumArtBySongName = async function(title) {
  if (!title) return null;
  try {
    var query = encodeURIComponent(title.replace(/[^\w\s]/g, ' ').trim());
    var resp = await fetch('https://y.com.sb/api/v1/search?q=' + query + '&type=video&limit=1');
    if (!resp.ok) return null;
    var data = await resp.json();
    var text = JSON.stringify(data);
    var idMatch = text.match(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/);
    if (idMatch) return 'https://i.ytimg.com/vi/' + idMatch[1] + '/hqdefault.jpg';
    return null;
  } catch (e) {
    console.warn('YouTube thumbnail error:', e);
    return null;
  }
};

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
