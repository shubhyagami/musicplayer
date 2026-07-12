var lyricsCache = {};

window.fetchLyrics = async function(title, artist, album, duration) {
  if (!title) return null;
  var cacheKey = (title + '|' + artist + '|' + album).toLowerCase();
  if (lyricsCache[cacheKey]) return lyricsCache[cacheKey];

  try {
    var url = 'https://lrclib.net/api/get?track_name=' + encodeURIComponent(title)
      + '&artist_name=' + encodeURIComponent(artist || '')
      + '&album_name=' + encodeURIComponent(album || '')
      + '&duration=' + Math.round(duration || 0);

    var resp = await fetch(url);
    if (!resp.ok) throw new Error('Not found');
    var data = await resp.json();
    var result = parseLyricsResponse(data);
    if (result) {
      lyricsCache[cacheKey] = result;
      return result;
    }
  } catch (e) {
    try {
      var result = await searchFallback(title, artist);
      if (result) {
        lyricsCache[cacheKey] = result;
        return result;
      }
    } catch (e2) {}
  }

  lyricsCache[cacheKey] = { synced: [], plain: null };
  return lyricsCache[cacheKey];
};

async function searchFallback(title, artist) {
  var query = title;
  if (artist) query += ' ' + artist;
  var url = 'https://lrclib.net/api/search?q=' + encodeURIComponent(query);

  var resp = await fetch(url);
  if (!resp.ok) return null;
  var results = await resp.json();
  if (!results || results.length === 0) return null;

  return parseLyricsResponse(results[0]);
}

function parseLyricsResponse(data) {
  if (!data) return null;
  var result = { synced: [], plain: null };

  if (data.plainLyrics) {
    result.plain = data.plainLyrics;
  }

  if (data.syncedLyrics) {
    result.synced = parseLRC(data.syncedLyrics);
  }

  if (result.synced.length === 0 && !result.plain) return null;
  return result;
}

function parseLRC(lrcText) {
  if (!lrcText) return [];
  var lines = [];
  var regex = /\[(\d+):(\d+\.\d+)\](.*)/g;
  var match;

  while ((match = regex.exec(lrcText)) !== null) {
    var minutes = parseInt(match[1], 10);
    var seconds = parseFloat(match[2]);
    var text = match[3].trim();
    if (text) {
      lines.push({ time: minutes * 60 + seconds, text: text });
    }
  }

  return lines;
}

window.getCurrentLyricLine = function(lines, currentTime) {
  if (!lines || lines.length === 0) return -1;
  var idx = -1;
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].time <= currentTime) {
      idx = i;
    } else {
      break;
    }
  }
  return idx;
};
