# Architecture

## Scope

This document describes `musical-palm-tree`, the Tauri desktop companion project
in the PlayMusic ecosystem. The main PlayMusic repository focuses on a
Go/Bubble Tea terminal player; this repository explores the same media-player
domain through a desktop UI, React state, Tauri IPC, and Rust-backed media work.

The two projects share learning-oriented open-source goals and media-player
ideas, while using different stacks and interaction models.

| Area | PlayMusic | musical-palm-tree |
| --- | --- | --- |
| Interface | Bubble Tea TUI | Desktop WebView UI |
| Main stack | Go | Tauri, React, TypeScript, Rust |
| Learning focus | Go packages, TUI, playback | React state, desktop UX, IPC, Rust commands |
| Video path | External player handoff | Embedded video pane |
| Contribution style | Focused PRs | Fork-friendly experiments + focused PRs |

## Overview

`musical-palm-tree` is a Tauri 2 desktop app with a React frontend and Rust backend.
The app is structured around the concept of "spaces" — distinct music sources
(local filesystem, online streaming, etc.) that share common playback
infrastructure.

## How To Read This Project

If you are new to this codebase, start with:

1. `src/App.tsx` - top-level layout and persistent player shell
2. `src/spaces/index.tsx` - registered content spaces
3. `src/spaces/LocalSpace.tsx` - local media library flow
4. `src/spaces/OnlineSpace.tsx` - online search results flow
5. `src/components/PlayerBar.tsx` - playback controls, waveform, and media elements
6. `src/store.ts` - global Zustand state and queue model
7. `src-tauri/src/lib.rs` - registered Rust commands
8. `src-tauri/src/scanner.rs` - local filesystem scanning
9. `src-tauri/src/waveform.rs` - waveform generation

The main mental model is: React owns UI and state, Tauri IPC connects it to
Rust, and Rust handles heavier filesystem and media work.

## Main User Flow

1. The app opens with a desktop shell: titlebar, header, sidebar, active space,
   video pane, and player bar.
2. The active space renders either local media or online search.
3. Local media is scanned through the Rust `scan_media` command.
4. Scan progress streams back to React via Tauri events.
5. Selecting a track updates the global queue in Zustand.
6. `PlayerBar` owns playback controls, waveform display, and audio/video
   elements.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS v4
- **Backend**: Rust (Tauri 2) for filesystem scanning, audio decoding, OS integration
- **State**: Zustand for global state, no React Context
- **Package manager**: Bun
- **Targets**: Windows (primary), macOS, Linux

## Top-Level Layout

┌─────────────────────────────────────────────────┐
│ Titlebar (custom — minimize/maximize/close) │
├─────────────────────────────────────────────────┤
│ Header (logo, scan stats, search bar) │
├──────┬──────────────────────────────────────────┤
│ │ │
│Space │ Active Space Component │
│Side │ (Local | Online | …) │
│bar │ │
│ ├─────────────┬────────────────────────────┤
│ │ │ Video Pane (right side, │
│ │ Library │ when video track playing) │
│ │ │ │
├──────┴─────────────┴────────────────────────────┤
│ Player Bar (overlays bottom of content) │
└─────────────────────────────────────────────────┘

## Spaces

A "space" is a self-contained content view registered in `src/spaces/index.tsx`.
Each space defines:

- `id` — unique identifier
- `name` — display name
- `icon` — JSX element for the sidebar
- `Component` — the React component rendered when the space is active

Switching spaces does NOT pause playback. The player bar, video pane, audio
volume, and current track persist across space switches because they live at
the root level, not inside any space.

### Active Spaces

| Space  | Source                   | Status         |
| ------ | ------------------------ | -------------- |
| Local  | Filesystem scan via Rust | ✅ Implemented |
| Online | yt-dlp search/streaming  | 🚧 Placeholder |

### Adding a New Space

1. Create `src/spaces/MySpace.tsx` with a default export component
2. Add it to `SPACES` array in `src/spaces/index.tsx`
3. Add per-space state to `spaces` object in `src/store.ts` if needed
4. Sidebar icon appears automatically

## State Architecture (Zustand)

Single store at `src/store.ts`. Three categories of state:

### Root-level (shared across spaces)

- `activeSpaceId` — currently selected space
- `currentTrack` — the playing track (regardless of source)
- `playing` — playback state (true/false)
- `theme` — `'dark' | 'light'`

### Per-space (namespaced under `spaces.{id}`)

- `spaces.local.dirs` — scanned directory tree
- `spaces.local.scanMeta` — scan timing/counts
- `spaces.local.scanState` — `'idle' | 'scanning' | 'done'`
- `spaces.local.liveCount` — live file count during scan
- `spaces.local.query` — search input
- `spaces.local.durations` — `Record<path, seconds>` filled lazily
- `spaces.local.collapsed` — `Set<string>` of collapsed album keys

### Selective subscriptions

Components only re-render when the slice they subscribe to changes:

```tsx
const dirs = useAppStore((s) => s.spaces.local.dirs)
```

## Component Hierarchy

App.tsx
├── Titlebar
├── Header
├── (main row)
│ ├── SpaceSidebar
│ ├── <ActiveSpace /> ← LocalSpace, OnlineSpace, etc.
│ │ └── (Local) Library
│ │ └── TrackList
│ │ └── Track (×N)
│ │ └── PlayingIndicator (when active)
│ ├── ScrollToActive ← lives inside LocalSpace
│ └── VideoPane ← portal target for video element
└── PlayerBar (absolute bottom, overlay)
├── Waveform
└── createPortal(<video>) → VideoPane

## Rust Backend (`src-tauri/src/`)

lib.rs ← entry, registers commands, runs Tauri
scanner.rs ← scan_media command, walks filesystem with rayon
waveform.rs ← generate_waveform command, decodes via symphonia

### Tauri Commands

| Command             | Purpose                                    | Sync/Async |
| ------------------- | ------------------------------------------ | ---------- |
| `scan_media`        | Recursive scan, emits progress events      | async      |
| `generate_waveform` | Decode + downsample first 60s for waveform | sync       |

### Scan Pipeline (3-phase, parallelized)

1. **Walk** (single-threaded) — `WalkDir` collects valid media file entries
2. **Process** (parallel via `rayon`) — chunked metadata reading + partial hash
3. **Merge** (single-threaded) — build directory tree, dedup, emit progress

Progress is emitted between chunks via `app.emit('scan_progress', dirs)` and
`app.emit('scan_count', count)`.

### Album Art Caching

- Extracted via `lofty` from audio file tags
- Cached to OS app cache dir: `app_cache_dir/art_{hash}.jpg`
- File path returned to frontend, rendered via `convertFileSrc`

### Waveform Generation

- Reads first 60 seconds of audio frames using `symphonia`
- Bounded memory regardless of file size — fixes WebView crashes on large files
- Downsampled to 100 normalized `f32` values
- Returned to frontend as `{ samples: number[] }`

## Custom Hooks (`src/hooks/`)

| Hook             | Purpose                                                      |
| ---------------- | ------------------------------------------------------------ |
| `useScan`        | Mounts scan listeners, invokes `scan_media`, writes to store |
| `useDurations`   | Lazily fills track durations via `<audio>` metadata          |
| `useMediaPlayer` | Audio/video playback controls, time, volume                  |
| `useVolume`      | Volume state with localStorage persistence + mute toggle     |
| `useWaveform`    | Invokes Rust `generate_waveform`, manages loading state      |
| `useResizable`   | Generic horizontal/vertical drag-to-resize with persistence  |
| `useFullscreen`  | Browser fullscreen API wrapper                               |
| `usePlayer`      | Next/prev track navigation across the flat track list        |

## Theming

Two themes via CSS variables in `src/App.css` `@theme` block:

- Default `:root` — dark mode (twilight blue gradient + amber accent)
- `[data-theme="light"]` — Mirror's Edge inspired (white + crimson red)

Theme toggled via `useAppStore(s => s.setTheme)`. Setting persists to
localStorage and applies via `document.documentElement.dataset.theme`.

Background gradients on `body` provide visual depth that's preserved by
translucent panel surfaces (`bg-app-bg/80`).

## Window Vibrancy (Windows)

- `tauri.conf.json` — `transparent: true, decorations: false`
- `lib.rs` — applies Mica (Win11) / Acrylic (Win10) via `window-vibrancy` crate
- `body` background uses linear gradient, panels use translucent backgrounds

## Persistence

Stored in localStorage:

- `playmusic-theme` — current theme
- `playmusic-volume` — last volume setting
- `playmusic-collapsed` — Set of collapsed album keys
- `playmusic-playerbar-height` — last drag-resized player bar height
- `playmusic-videopane-width` — last drag-resized video pane width

Album art cache stored in OS app cache dir (cleared if the app is uninstalled).

## Constants & Utilities

- `src/constants.ts` — `VIDEO_EXTS`, `AUDIO_EXTS`, `isVideo()`, `isAudio()`
- `src/utils/filterDirs.ts` — fuzzy search via Fuse.js with weighted fields

## Conventions

- Colors in components use `text-app-*`, `bg-app-*`, `border-app-*` classes
  or `var(--color-app-*)` in inline styles. No hardcoded hex values or raw
  `slate-*` / `red-*` Tailwind classes.
- New shared state goes in the Zustand store, not React Context.
- Local-space-specific state lives under `spaces.local.*` in the store.
- Components subscribe selectively via `useAppStore(s => s.specificField)` to
  minimize re-renders.
- Heavy CPU/IO work runs in Rust commands, not in the WebView.
- Long-running operations emit progress events for streaming UI updates.
