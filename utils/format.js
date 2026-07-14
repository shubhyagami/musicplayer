window.formatTime = function(seconds) {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m + ':' + s.toString().padStart(2, '0');
};

window.formatTrackNumber = function(num) {
  return 'TRK-' + (num || 0).toString().padStart(3, '0');
};

window.stripExtension = function(filename) {
  return filename.replace(/\.[^.]+$/, '').trim();
};

window.cleanSongTitle = function(raw) {
  if (!raw) return raw;
  var s = raw;
  var hasYT = /[_\[][a-zA-Z0-9_-]{11}\]?$/.test(s);
  var hasSite = /(Pagal\w|Pagla\w|SongsPk|DJPunjab|PagalHits|PagalRingtone|mp3\.pm)/i.test(s);
  // Remove YouTube video IDs: _xxxxxxxxxxx or [xxxxxxxxxxx]
  s = s.replace(/[_\[][a-zA-Z0-9_-]{11}\]?$/, '');
  // Remove download site stickers
  s = s.replace(/[-\(_\s]+(Pagal\w+|Pagla\w+|SongsPk[^)]*|DJPunjab[^)]*|PagalHits[^)]*|PagalRingtone[^)]*|mp3\.pm[^)]*)/gi, '');
  // Remove remaining parenthesized suffixes
  while (/\([^)]*\)\s*$/.test(s)) { s = s.replace(/\([^)]*\)\s*$/, ''); }
  // Remove quality tags: 320 Kbps, [320] Kbps, _320, trailing 320
  s = s.replace(/[\s_\-]*\d{3}\s*Kbps/i, '');
  s = s.replace(/[\s_\-]*\[\d{3}\].*$/, '');
  // Remove descriptors in parens
  s = s.replace(/\s*\([^)]*(?:Lyrics|Audio|Official|Slowed|Reverb|Remake|Version|Edit|Lofi|Peaceful|Backgrounds|Soundtrack|Visualizer|Remix)[^)]*\)/gi, '');
  s = s.replace(/\s*-\s*(?:Lyrics|Lyric|Audio|Official|Slowed).*$/i, '');
  // Remove " ft. ", " feat. " and everything after
  s = s.replace(/\s+f(?:ea)?t\.?\s*.*$/i, '');
  // Handle " - " separator: YouTube → Artist-Song, Site → Song-Artist
  var dashMatch = s.match(/^(.*?)\s*-\s+(.*)$/);
  if (dashMatch) {
    var before = dashMatch[1].trim();
    var after = dashMatch[2].trim();
    if (hasYT && !hasSite) {
      s = after;
    } else {
      s = before;
    }
  }
  // Replace underscores with spaces
  s = s.replace(/_/g, ' ');
  // Cleanup whitespace
  s = s.replace(/^[\s\-_]+|[\s\-_]+$/g, '');
  s = s.replace(/\s{2,}/g, ' ');
  return s.trim();
};

window.escapeHtml = function(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
};
