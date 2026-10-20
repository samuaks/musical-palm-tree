# Architecture

## Scope

This document describes PlayMusic Desktop, the Tauri desktop companion project
in the PlayMusic ecosystem. The repository is currently named `musical-palm-tree`.
The main PlayMusic repository focuses on a
Go/Bubble Tea terminal player; this repository explores the same media-player
domain through a desktop UI, React state, Tauri IPC, and Rust-backed media work.

The two projects share learning-oriented open-source goals and media-player
ideas, while using different stacks and interaction models.

| Area | PlayMusic | PlayMusic Desktop |
| --- | --- | --- |
| Interface | Bubble Tea TUI | Desktop WebView UI |
| Main stack | Go | Tauri, React, TypeScript, Rust |
| Learning focus | Go packages, TUI, playback | React state, desktop UX, IPC, Rust commands |
| Video path | External player handoff | Embedded video pane |
| Contribution style | Focused PRs | Fork-friendly experiments + focused PRs |

## Overview

PlayMusic Desktop is a Tauri 2 desktop app with a React frontend and Rust backend.
It has one main view: your local library, and a single search box that filters it as you
type and searches YouTube (through the optional yt-dlp) when you press Enter. Local tracks
and YouTube results share the same playback infrastructure.

## How To Read This Project

If you are new to this codebase, start with:

1. `src/App.tsx` - top-level layout and persistent player shell
2. `src/components/Header.tsx` - library stats and the search box
3. `src/components/MainView.tsx` - the library and YouTube sections
4. `src/components/YouTubeSection.tsx` - YouTube results, playing and downloading
5. `src/components/PlayerBar.tsx` - playback controls, waveform, and media elements
6. `src/store.ts` - global Zustand state and queue model
7. `src-tauri/src/lib.rs` - registered Rust commands
8. `src-tauri/src/scanner.rs` - local filesystem scanning
9. `src-tauri/src/waveform.rs` - waveform generation

The main mental model is: React owns UI and state, Tauri IPC connects it to
Rust, and Rust handles heavier filesystem and media work.

## Main User Flow

1. The app opens with a desktop shell: titlebar, header, main view, video pane, and
   player bar.
2. The library is scanned at startup through the Rust `scan_media` command; scan progress
   streams back to React via Tauri events.
3. Typing in the search box filters the library (Fuse.js). Pressing Enter also searches
   YouTube; results appear in a YOUTUBE section under the library matches.
4. Selecting a track (local or YouTube) updates the global queue in Zustand: the queue is the
   list it was picked from.
5. `PlayerBar` owns playback controls, waveform display, and audio/video
   elements.

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS v4
- **Backend**: Rust (Tauri 2) for filesystem scanning, audio decoding, OS integration
- **State**: Zustand for global state, no React Context
- **Package manager**: Bun
- **Targets**: Windows (primary), macOS, Linux

## Top-Level Layout

┌─────────────────────────────────────────────────┐
│ Titlebar (custom — minimize/maximize/close) │
├─────────────────────────────────────────────────┤
│ Header (stats, search box, theme toggle) │
├────────────────────────────┬────────────────────┤
│ MainView │ Video Pane │
│ LIBRARY (filtered) │ (right side, when │
│ YOUTUBE (while searching) │ a video plays) │
├────────────────────────────┴────────────────────┤
│ Player Bar │
└─────────────────────────────────────────────────┘

## Main View and Search

There's one search box (`query` in the store), in `Header`:

- **Empty**: `MainView` shows the whole library (directories → albums → tracks).
- **Typing**: `Library` filters with `filterDirs` (Fuse.js) and gets a `LIBRARY n` header.
  Below it, `YouTubeSection` offers `search youtube for "…" ⏎`. YouTube isn't searched while
  typing, so local lookups never call yt-dlp.
- **Enter** (or clicking that row): `searchYouTube(query)` in `src/api/online.ts` runs
  `search_online` and stores the results with the query they belong to (`searchedQuery`). If
  the query changes afterwards, the old results stay under a `results for "…"` label until
  the next search. A newer search always wins over a slower older one.
- **Clearing** the box drops the YouTube results (`clearYouTubeSearch`).

Playback doesn't care where a track came from: the player bar, video pane, volume and current
track live at the root, and the queue is whatever list the track was picked from (library
order, or the YouTube results).

Until yt-dlp is installed, the YOUTUBE section shows the install panel instead of results; it's
hidden entirely on platforms where the app can't install yt-dlp.

## State Architecture (Zustand)

Single store at `src/store.ts`, with state grouped by source:

### Root-level

- `query` — the search box: filters the library, searched on YouTube on Enter
- `queue` / `queueIndex` — the play queue, the single source of truth for playback;
  the current track (local or online) is derived via `selectCurrentTrack`
- `playing` — playback state (true/false)
- `resolving` — an online stream URL is being resolved
- `videoActive` — the current track shows a picture (a local video, or an online track with a
  video stream); drives the video pane and fullscreen
- `ytDlp` — `{ available, can_install, ffmpeg }`, checked at startup
- `theme` — `'dark' | 'light'`

### Library (`library.*`)

- `library.dirs` — scanned directory tree
- `library.scanMeta` — scan timing/counts
- `library.scanState` — `'idle' | 'scanning' | 'done'`
- `library.liveCount` — live file count during scan
- `library.durations` — `Record<path, seconds>` filled lazily
- `library.collapsed` — `Set<string>` of collapsed album keys

### YouTube (`youtube.*`)

- `youtube.results` / `searchedQuery` / `searchState` / `searchError` — the last search
- `youtube.video` — play online tracks with video (persisted, default on)
- `youtube.downloads` — download status per `videoId:kind` (state, percent, path/error)

### Selective subscriptions

Components only re-render when the slice they subscribe to changes:

```tsx
const dirs = useAppStore((s) => s.library.dirs)
```

## Component Hierarchy

App.tsx
├── Titlebar
├── Header ← stats, search box (Enter searches YouTube), ThemeToggle
├── (main row)
│ ├── MainView ← runs the scan, durations and download-progress listeners
│ │ ├── ScrollToActive
│ │ ├── Library ← LIBRARY (filtered by the query)
│ │ │ └── TrackList
│ │ │ └── Track (×N)
│ │ │ └── PlayingIndicator (when active)
│ │ └── YouTubeSection ← YOUTUBE (while the query isn't empty)
│ │ └── ResultRow (×N) + DownloadButtons
│ └── VideoPane ← portal target for video element
└── PlayerBar
├── Waveform
└── createPortal(<video>) → VideoPane

## Rust Backend (`src-tauri/src/`)

lib.rs ← entry, registers commands, runs Tauri
scanner.rs ← scan_media command, walks filesystem with rayon
art.rs ← cover_art command, embedded/folder cover thumbnails on demand
waveform.rs ← generate_waveform command, decodes via symphonia
online.rs ← search_online / resolve_stream commands
ytdlp.rs ← yt_dlp_status / install_yt_dlp, finds/updates/runs yt-dlp

### Tauri Commands

| Command             | Purpose                                    | Sync/Async |
| ------------------- | ------------------------------------------ | ---------- |
| `scan_media`        | Recursive scan, emits progress events      | async      |
| `generate_waveform` | Whole-track loudness overview (cached)     | async      |
| `cover_art`         | Cover thumbnail for one track, as data URL | async      |
| `search_online`     | yt-dlp `ytsearch10:` flat search           | async      |
| `resolve_stream`    | yt-dlp lookup of audio (+ video) URLs      | async      |
| `download_media`    | Download audio/video into the library      | async      |
| `yt_dlp_status`     | yt-dlp found / installable, ffmpeg found   | sync       |
| `install_yt_dlp`    | Download + verify yt-dlp into app data dir | async      |

### Scan Pipeline (3-phase, parallelized)

1. **Walk** (parallel per allowed dir) — `WalkDir` over `Downloads`, `Music`,
   `Videos`, `Desktop`, `Documents` (3 levels deep) collects media file entries
2. **Process** (parallel via `rayon`) — chunked metadata reading and partial hash
3. **Merge** (single-threaded, walk order) — build directory tree, dedup, emit progress.
   Albums and their tracks are listed in natural name order (`2 …` before `10 …`, case-insensitive);
   walk order only decides which copy of a duplicate is kept

The scan runs on a blocking thread (`spawn_blocking`). `app.emit('scan_count', count)`
fires after every chunk; `app.emit('scan_progress', dirs)` sends a tree snapshot at
most every 250 ms.

### Cover Art (`art.rs`)

Shown in the player bar for the current track, so it's produced on demand rather than during
the scan. `useCoverArt` calls `cover_art(path)` when a local track becomes current (online
tracks use their YouTube thumbnail URL) and keeps up to 200 results in memory.

- **Embedded picture** via `lofty` (front cover preferred, else the first picture). Works for
  ID3 (mp3), FLAC PICTURE blocks, Ogg `METADATA_BLOCK_PICTURE` and MP4 `covr` (m4a).
- **Folder image** fallback: `cover`, `folder`, `front` or `album` + `.jpg`/`.jpeg`/`.png` in
  the track's folder, case-insensitive.
- **Thumbnails**: downscaled to fit 256×256 and stored as JPEG with the `image` crate; formats
  it can't decode (WebP, GIF) are kept as-is.
- **Cache** in `app_cache_dir`: `cover_<partial hash>.jpg` per file, an empty
  `cover_<hash>.none` when there's no embedded art (folder images are still checked each time,
  so adding one later works), and `cover_dir_<md5(path, size, mtime)>.jpg` for folder images.
  Old `art_*` files from earlier versions are deleted at startup.
- Returned as a `data:` URL, so the WebView needs no asset-protocol access for art.

### Waveform Generation

- Decodes the **whole track** with `symphonia`, folding samples into 50 ms chunks (mean absolute
  value) as it goes, so memory stays small for any length (~45k floats for 38 minutes). The JS
  `decodeAudioData` this replaced loaded whole files as PCM and crashed the WebView.
- Chunks are averaged down to at most 1024 points, normalized to 0..=1, and returned as
  `{ samples: number[] }`.
- Async command on a blocking worker (`spawn_blocking`), so the UI stays responsive. Each call
  bumps a request counter; a decode checks it every 64 packets and stops once a newer request
  has started, so skipping tracks doesn't pile up work.
- Cached as `app_cache_dir/wave_v2_<partial hash>.bin` (little-endian f32s, ~4 KB); bump the
  version prefix if the algorithm changes. Corrupt cache files are ignored and regenerated.
- Rough cost in a release build: ~0.7 s for a 4-minute track, ~2.6 s for a 24-minute one. Dev
  builds compile dependencies with `opt-level = 3` (see `Cargo.toml`) so they're close to that.
- `useWaveform` ignores results for tracks that are no longer current. `Waveform` shows a plain
  progress line (same seek/hover behavior) until bars arrive, then fades them in. It measures
  its width and draws as many 2 px bars (2 px gaps) as fit, resampling the points by taking each
  group's peak; the playhead is a single bar.

### Online Playback (`online.rs`, `useAudioPlayer`, `useVideoSync`)

YouTube only offers picture and sound in one stream at 360p (format 18); everything sharper is
a video-only stream. So `resolve_stream(video_id, video)` asks yt-dlp (`--dump-json -f ...`) for
two https URLs: a video-only stream up to 1080p (avc1 preferred, since every WebView decodes it;
no HLS, which WebView2 can't play) and an m4a audio stream. With video off, or when there's no
usable video stream, it returns audio only.

- The sound plays in the `<audio>` element, which stays the master: play, pause, seek, volume,
  `timeupdate` and `ended` all go through it, as for any audio track.
- The picture plays muted in the `<video>` (portaled into the video pane). `useVideoSync`
  mirrors play/pause/seek/rate onto it and pauses it while the audio buffers. Small drift
  (> 40 ms) is closed by running the video 10% faster or slower for a moment; more than 0.3 s
  snaps it to the audio's time. The audio is never paused for the video.
- The player bar's video button toggles `youtube.video`; the current track is re-resolved
  and resumes where it was.
- Stream URLs expire after a few hours. An `error` on either element re-resolves both and resumes
  (at most every 10 s).

### Downloads (`download.rs`)

`download_media(video_id, kind)` saves a search result into a scanned folder, so it becomes a
local track: audio as m4a in `~/Music/YouTube`, video as mp4 in `~/Videos/YouTube` (album
"YouTube" in the library). Files are named `<title> [<id>].<ext>`; an existing file with that
id is returned without downloading again.

- **ffmpeg is optional** (`ytdlp::locate_ffmpeg`: `PATH`, then Homebrew/pipx dirs). With it:
  video up to 1080p (avc1 + m4a merged into mp4), and title/artist/cover embedded. Without it:
  the m4a audio stream as is, or YouTube's 360p stream with picture and sound (format 18).
- Runs through `ytdlp::run_streaming`, which reads yt-dlp's output line by line. A progress
  template prints `PROGRESS <downloaded> <total> <estimate>` lines, which become
  `download_progress { video_id, kind, downloaded, total }` events (≤ 4/s). A video download
  reports its video and audio parts in turn.
- The finished file is found by its `[<id>]` name rather than from yt-dlp's printed path, which
  Windows consoles can mangle for non-ASCII titles.
- **Frontend**: `DownloadButton`s on each YouTube result row track their status in
  `youtube.downloads` (progress is listened to in `MainView`). When a download lands, `scanLibrary()` (`api/local.ts`) rescans;
  a call during a scan queues one more. Live `scan_progress` snapshots only fill an empty
  library, so a rescan doesn't flicker the list.

### Optional yt-dlp (`ytdlp.rs`)

yt-dlp is an optional runtime dependency, not a required Tauri sidecar, so the app builds and
runs without it (local-only). `ytdlp.rs` owns finding, installing, updating and running it;
`online.rs` only calls `ytdlp::run`.

- **Lookup** (per call): the app-managed copy in `app_data_dir/bin/` first, then the dev
  sidecar path `src-tauri/binaries/yt-dlp-<triple>` (debug builds only), next to the app
  executable (where a bundled sidecar is installed), `PATH`, and finally `/opt/homebrew/bin`,
  `/usr/local/bin` and `~/.local/bin` (GUI launches on macOS don't inherit the shell's `PATH`).
- **Install** (`install_yt_dlp`): resolves the latest release from the
  `releases/latest/download/SHA2-256SUMS` redirect (no GitHub API, so no rate limit), downloads
  the platform's standalone asset (`yt-dlp.exe`, `yt-dlp_macos`, `yt-dlp_linux`, ...) from that
  same release, verifies its SHA-256, and renames it into place. Emits `yt_dlp_download` progress
  events. `yt-dlp.version` next to the binary records the installed version.
- **Update**: checked at startup if more than a day has passed, and when a command fails (at
  most hourly), after which the command is retried once. It depends on where the copy in use
  came from (`Source`):
  - *Managed*: replaced in place when a newer release exists.
  - *Bundled* (next to the executable, shipped by release installers): it's in a read-only
    install dir, so when its `--version` is older than the latest release, the latest is
    installed as the managed copy, which `locate` prefers from then on.
  - *External* (`PATH`, package managers, the dev sidecar): left to the user.
  Updating reuses the verified install download rather than `yt-dlp -U`. `yt-dlp.version` holds
  the version in use; its mtime is the last check.
- An `RwLock` keeps updates from replacing the binary while it runs, which Windows doesn't
  allow.
- **Frontend**: `yt_dlp_status` returns `{ available, can_install, ffmpeg }`. `useOnlineAvailability`
  calls it at startup. The YOUTUBE section shows a download panel while yt-dlp is missing; it's
  hidden only on platforms with no yt-dlp build to download.
- `src-tauri/tauri.bundle-yt-dlp.conf.json` adds yt-dlp back as `externalBin` for installers that
  should ship it: `bun run tauri build --config src-tauri/tauri.bundle-yt-dlp.conf.json`.

## Custom Hooks (`src/hooks/`)

| Hook             | Purpose                                                      |
| ---------------- | ------------------------------------------------------------ |
| `useScan`        | Mounts scan listeners, runs the first `scanLibrary()`        |
| `useDurations`   | Lazily fills track durations via `<audio>` metadata          |
| `useAudioPlayer` | Audio/video playback, seek, keyboard shortcuts, stream resolve |
| `useVideoSync`   | Keeps an online track's muted video in step with its audio   |
| `useVolume`      | Volume state with localStorage persistence + mute toggle     |
| `useWaveform`    | Invokes Rust `generate_waveform`, manages loading state      |
| `useResizable`   | Generic horizontal/vertical drag-to-resize with persistence  |
| `useFullscreen`  | Browser fullscreen API wrapper                               |
| `usePlayer`      | Next/prev through the store queue                            |
| `useLocalFlatTracks` | All local tracks flattened in Library order, for enqueueing |
| `useAudioNormalization` | Web Audio compressor/gain chain (not currently wired up) |

## Theming

Two themes via CSS variables in `src/App.css` `@theme` block:

- Default `:root` — dark mode (twilight blue gradient + amber accent)
- `[data-theme="light"]` — Mirror's Edge inspired (white + crimson red)

Theme toggled via `useAppStore(s => s.setTheme)`. Setting persists to
localStorage and applies via `document.documentElement.dataset.theme`.

Background gradients on `body` provide visual depth that's preserved by
translucent panel surfaces (`bg-app-bg/80`).

## Custom Window Chrome

- `tauri.conf.json` — `transparent: true, decorations: false`
- `components/TitleBar.tsx` — draws minimize/maximize/close and the drag region; the
  matching window permissions are in `src-tauri/capabilities/default.json`
- `body` background uses linear gradient, panels use translucent backgrounds

## Persistence

Stored in localStorage:

- `playmusic-theme` — current theme
- `playmusic-volume` — last volume setting
- `playmusic-collapsed` — Set of collapsed album keys
- `playmusic-playerbar-height` — last drag-resized player bar height
- `playmusic-videopane-width` — last drag-resized video pane width
- `playmusic-online-video` — whether online tracks play with video

Cover thumbnails are cached in the OS app cache dir (cleared if the app is uninstalled).

## Constants & Utilities

- `src/constants.ts` — `VIDEO_EXTS`, `AUDIO_EXTS`, `isVideo()`, `isAudio()`
- `src/utils/filterDirs.ts` — fuzzy search via Fuse.js with weighted fields
- `src/api/local.ts` — `scanLibrary()`; `src/api/online.ts` — `searchYouTube()`,
  `clearYouTubeSearch()` and the IPC wrappers

## Conventions

- Colors in components use `text-app-*`, `bg-app-*`, `border-app-*` classes
  or `var(--color-app-*)` in inline styles. No hardcoded hex values or raw
  `slate-*` / `red-*` Tailwind classes.
- New shared state goes in the Zustand store, not React Context.
- State is grouped by source in the store: `library.*` for local files, `youtube.*` for
  YouTube search, downloads and the video setting.
- Components subscribe selectively via `useAppStore(s => s.specificField)` to
  minimize re-renders.
- Heavy CPU/IO work runs in Rust commands, not in the WebView.
- Long-running operations emit progress events for streaming UI updates.
