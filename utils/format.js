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

window.escapeHtml = function(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
};
