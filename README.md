# AUDIO STATION 🎵

A retro-futuristic Spotify-clone music player built as a single-page React app — no build tools, no backend, runs entirely in the browser.

## Features

- **No build tools** — React via CDN + Babel Standalone for JSX transform, works with just a static file server
- **Local folder loading** — `showDirectoryPicker()` API with `<input webkitdirectory>` fallback
- **ID3 metadata** — extracts title, artist, album, album art via `jsmediatags`
- **Web Audio API** — EQ filter chain (bass/mid/treble) + spatial surround stage (mid-side widening + convolution reverb)
- **Synced lyrics** — fetches from LRCLIB API with LRC timestamp parsing and auto-scroll
- **VU meter** — real-time level visualization via AnalyserNode
- **Retro-futuristic UI** — CRT scanlines, amber glow, rotary knobs, beveled buttons, teletype lyrics panel
- **Persistence** — EQ, spatial, and volume saved to localStorage

## Usage

Open `index.html` via any static HTTP server (Live Server, `npx http-server`, Python `http.server`, etc.)

```
npx http-server -p 8080
```

Then open http://localhost:8080, click **+ LOAD FOLDER**, and select a directory with `.mp3`/`.wav`/`.flac`/`.m4a` files.

## Architecture

```
index.html          — React 18 CDN + Babel Standalone + all React components inline
style.css           — Full retro-futuristic visual style
utils/
  format.js         — formatTime, formatTrackNumber, escapeHtml helpers
  metadata.js       — Folder picker, ID3 extraction, batch file processing
  lyrics.js         — LRCLIB API fetch, LRC parsing, in-memory caching
```

### Audio Signal Chain

```
<audio> → MediaElementSourceNode
  → Bass (lowshelf 200Hz)
  → Mid (peaking 1kHz)
  → Treble (highshelf 6kHz)
  → ChannelSplitter(2) → Mid-Side processing → ChannelMerger(2)
  → [dryGain] ────────→ master GainNode → AnalyserNode → destination
  → [convolver (synthetic IR) → reverbGain] ──┘
```

## License

MIT
