var AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg', '.wma'];

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
            picture: albumArtUrl
          });
        },
        onError: function() { resolve(null); }
      });
    } catch (e) { resolve(null); }
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
