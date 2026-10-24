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
It's laid out like YouTube Music: a sidebar of pages (Home, Explore, Your library, Recently
played, and each local folder), a top bar with back/forward and a single search box that filters
the library as you type and, when you press Enter, searches YouTube or lists a Twitch channel's
VODs (through the optional yt-dlp). Local tracks and online results share the same playback
infrastructure.

## How To Read This Project

If you are new to this codebase, start with:

1. `src/App.tsx` - top-level layout and persistent player shell
2. `src/components/Sidebar.tsx` and `TopBar.tsx` - page navigation, the search box, window controls
3. `src/components/MainView.tsx` and `pages/Pages.tsx` - the page for `nav.view`, or search results
4. `src/components/OnlineSection.tsx` - YouTube/Twitch results, playing and downloading
5. `src/components/PlayerBar.tsx` - playback controls, waveform, and media elements
6. `src/store.ts` - global Zustand state and queue model
7. `src-tauri/src/lib.rs` - registered Rust commands
8. `src-tauri/src/scanner.rs` - local filesystem scanning
9. `src-tauri/src/waveform.rs` - waveform generation

The main mental model is: React owns UI and state, Tauri IPC connects it to
Rust, and Rust handles heavier filesystem and media work.

## Main User Flow

1. The app opens with a desktop shell: sidebar, top bar, the last page shown, video pane, and
   player bar.
2. The library is scanned at startup through the Rust `scan_media` command; scan progress
   streams back to React via Tauri events.
3. Typing in the search box filters the library (Fuse.js). Pressing Enter also searches the
   selected online platform; results appear in an ONLINE section under the library matches.
4. Selecting a track (local or online) updates the global queue in Zustand: the queue is the
   list it was picked from. Stop (`clearQueue()`: the square button, the × or `S`) empties it: with
   no current track `useAudioPlayer` lets go of both elements and any hls.js stream, and the
   player bar is hidden (it's hidden at startup too) until a track is picked. The bar stays
   mounted while hidden, so the hook and the `<video>` portal keep running.
5. `PlayerBar` owns playback controls, waveform display, and audio/video
   elements.

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS v4
- **Backend**: Rust (Tauri 2) for filesystem scanning, audio decoding, OS integration
- **State**: Zustand for global state, no React Context
- **Package manager**: Bun
- **Targets**: Windows (primary), macOS, Linux

## Top-Level Layout

┌────────────┬────────────────────────────────────────────────────┐
│ Sidebar │ TopBar (‹ › · search · theme · window controls) │
│ Home ├───────────────────────────────┬────────────────────┤
│ Explore │ MainView: the page for │ Video Pane │
│ Library │ nav.view, or search results │ (right side, when │
│ Recently │ while the box has text │ a video plays) │
│ Folders… │ │ │
│ Channels… │ │ │
├────────────┴───────────────────────────────┴────────────────────┤
│ Player Bar (now playing · controls over waveform · volume) │
└─────────────────────────────────────────────────────────────────┘

## Pages and Navigation

`nav` in the store holds the page (`nav.view`, persisted as `playmusic-view`) and the back and
forward stacks. `navigate(view)` (the sidebar) pushes the current page onto `back`; ‹ and › in
the top bar walk the stacks. Opening a page clears the search box, so the page shows instead of
results. `pages/Pages.tsx` renders the view:

- **Home**: Most listened (6 tiles, "see all", "play all"), recently played (first 5, "see all")
  and the newest library files.
- **Most listened**: the top 50 of the last 30 days, as rows.
- **Explore**: your Twitch channels as chips, then the YouTube/Twitch tabs and the last online
  search (`OnlineSection page`).
- **A channel** (sidebar → CHANNELS, or an Explore chip; `pages/ChannelPage.tsx`): its live stream
  on top, if it's live, and its recent VODs: `search_online(name, 'twitch')`, kept in the page
  (not `online.results`), reused for 2 minutes, and fetched once even if two requests overlap.
- **Your library**: scan stats and the whole library. **A folder** (sidebar → Local folders):
  just that folder (`Library only`).
- **Recently played**: the play log, library files and online items mixed.

`MainView` keeps one scroll element for every page (`SCROLL_ROOT_ID`, which the lazy-cover
observer is rooted on) and scrolls it back to the top when the page or the search changes.

## Search

There's one search box (`query` in the store), in `TopBar`. `Ctrl+K` focuses it and `Esc`
clears it, back to the page.

- **Empty**: the current page shows.
- **Typing**: the search page: recently played and the library, filtered. `Library` filters
  with `filterDirs` (Fuse.js) and gets a `LIBRARY n` header.
  Below it, `OnlineSection` (with **youtube** / **twitch** tabs, `online.platform`) offers
  `search youtube for "…" ⏎` or `list twitch vods from "…" ⏎`. Nothing online is searched
  while typing, so local lookups never call yt-dlp.
- **Enter** (or clicking that row): `searchOnlineNow(query)` in `src/api/online.ts` runs
  `search_online(query, platform)` and stores the results with the query they belong to
  (`searchedQuery`). If the query changes afterwards, the old results stay under a
  `results for "…"` label until the next search. A newer search always wins over a slower
  older one, and switching tabs (`selectPlatform`) drops the results.
- **Clearing** the box (or `Esc`, or opening a page) keeps the online results, so the Explore page
  still shows the last search; switching tabs or a new search replaces them.

What a query means is decided in Rust (`classify` in `online.rs`):
- a pasted YouTube link (`watch`, `shorts`, `youtu.be`, music.youtube) or Twitch VOD link
  (`twitch.tv/videos/<id>`) → that one video, on either tab
- a Twitch channel link, or a channel name on the twitch tab → the channel's 20 most recent
  VODs (`twitch.tv/<name>/videos?filter=archives&sort=time`), newest first. yt-dlp can't search
  Twitch, and its channel list has no dates: the broadcast start is read from each thumbnail URL
  (`…_<unix time>//thumb/…`), and the list is kept sorted by VOD id, which only goes up.
- anything else on the youtube tab → `ytsearch20:`

Playback doesn't care where a track came from: the player bar, video pane, volume and current
track live at the root, and the queue is whatever list the track was picked from (library
order, or the online results).

Until yt-dlp is installed, the ONLINE section shows the install panel instead of results; it's
hidden entirely on platforms where the app can't install yt-dlp.

## Play log, Recently played and Most listened

`plays` in the store is the play log (`PlayEntry[]`, persisted as `playmusic-plays`): anything that
played for 30 s, or half of a shorter track (`usePlayLog`, mounted in `MainView`; time paused,
resolving, or after the stream failed doesn't count). A library file is kept by its path, an online
item with what's needed to list and replay it. Playing something again moves it to the top and adds
the time to its `recent` plays, which keep only the last 30 days; the log keeps the newest 500. The
pure parts (`withPlay`, `mostListened`, `filterPlays`, the migration) are in `src/utils/plays.ts`.
The old online-only `playmusic-history` is migrated into it once (each entry played once, at its
`watched_at`) and then removed.

`RecentlyPlayed` (`PlayLog.tsx`: the Recently played page, and the top of Home and of search results)
lists the log, most recent first; library files that left the library are skipped. It's filtered by
the query like the library, folds like an album (`recentCollapsed`), and a row plays with the other
rows as the queue: library rows through `Track` (`onPlay`, "played 2h ago"), online rows like online
results. A live channel plays alone, and the queue from anything else leaves live channels out, so
playback never runs into one by itself. A live stream is kept as its channel (`live:<channel>`):
playing it again watches the channel live now, and if that fails (`online.failedStreams`, set in
`useAudioPlayer`) the row says **offline**. The header has a **clear** control (click twice), and
each row an × to remove it.

**Most listened** ranks the log by plays in the last 30 days (ties: played last first) and leaves
live channels out (they're channels, not tracks). Home shows the top 6 as tiles with **play all**;
the Most listened page lists 50. Play counts are never shown.

## State Architecture (Zustand)

Single store at `src/store.ts`, with state grouped by source:

### Root-level

- `query` — the search box: filters the library, searched online (YouTube or Twitch) on Enter
- `nav` — `{ view, back, forward }`: the page shown (persisted) and the ‹ › stacks
- `plays` — the play log (`PlayEntry[]`), most recent first, at most 500 (persisted);
  `recentCollapsed` folds the recently played section (persisted)
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

### Online (`online.*`)

- `online.platform` — the ONLINE tab, `'youtube' | 'twitch'` (persisted)
- `online.results` / `searchedQuery` / `searchState` / `searchError` — the last search
- `online.video` — play the current online track with video (back on for every new track)
- `online.downloads` — download status per `platform:videoId:kind` (state, percent, path/error)
- `online.failedStreams` — `platform:videoId` keys whose stream couldn't be resolved the last
  time (a live channel that's offline now), so its recently played row can say so
- `online.liveChannels` — Twitch channels (login names) the last live check found live

### Selective subscriptions

Components only re-render when the slice they subscribe to changes:

```tsx
const dirs = useAppStore((s) => s.library.dirs)
```

## Component Hierarchy

App.tsx
├── Sidebar ← pages, local folders, CHANNELS with live dots (navigate)
├── TopBar ← ‹ ›, search box (Enter searches online), activity, ThemeToggle, window controls
├── (main row)
│ ├── MainView ← runs the scan, durations, download-progress, play-log and live-status hooks
│ │ ├── ScrollToActive
│ │ └── CurrentPage (pages/Pages.tsx) ← Home / Explore / Library / Recently played / Most
│ │ │ listened / folder / channel, or the search page while the query isn't empty, built from:
│ │ ├── PageHeader ← page title and subtitle
│ │ ├── ChannelPage ← a Twitch channel: live stream + VODs (ResultRow), refresh
│ │ ├── YourChannels (Explore) ← your Twitch channels as chips
│ │ ├── MostListenedTiles / MostListenedList (PlayLog.tsx) ← top of the last 30 days
│ │ ├── RecentlyPlayed (PlayLog.tsx) ← RECENTLY PLAYED (filtered, foldable, `limit`)
│ │ │ └── PlayList → Track (library) / OnlinePlayRow (online) + remove
│ │ ├── Library ← folders and albums (filtered by the query; `only` for one folder)
│ │ │ └── TrackList
│ │ │ └── Track (×N) → TrackRow + TrackCover (lazy cover)
│ │ └── OnlineSection ← ONLINE + youtube/twitch tabs (search page, or Explore with `page`)
│ │ └── ResultRow (×N) → TrackRow + TrackCover + DownloadButtons
│ └── VideoPane ← portal target for video element
└── PlayerBar
├── Waveform
└── createPortal(<video>) → VideoPane

## Rust Backend (`src-tauri/src/`)

lib.rs ← entry, registers commands, runs Tauri
scanner.rs ← scan_media command, walks filesystem with rayon
art.rs ← cover_art command, embedded/folder cover thumbnails on demand
waveform.rs ← generate_waveform command, decodes via symphonia
online.rs ← search_online / resolve_stream / fetch_live_playlist / twitch_live_status commands
ytdlp.rs ← yt_dlp_status / install_yt_dlp, finds/updates/runs yt-dlp

### Tauri Commands

| Command             | Purpose                                    | Sync/Async |
| ------------------- | ------------------------------------------ | ---------- |
| `scan_media`        | Recursive scan, emits progress events      | async      |
| `generate_waveform` | Whole-track loudness overview (cached)     | async      |
| `cover_art`         | Cover thumbnail for one track, as data URL | async      |
| `search_online`     | YouTube search / Twitch channel VODs / link | async      |
| `resolve_stream`    | yt-dlp lookup of audio (+ video) URLs      | async      |
| `fetch_live_playlist` | Twitch live playlist for hls.js (no Origin) | async     |
| `twitch_live_status` | Whether each channel is live (first 10, in parallel) | async |
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

Shown in the player bar for the current track and in every list row, so it's produced on demand
rather than during the scan. Both go through `loadCover(path)` in `src/hooks/useCoverArt.ts`,
which calls `cover_art(path)`, shares lookups already in flight, and keeps up to 400 results in
memory. Online tracks use their YouTube or Twitch thumbnail URL.

- **List rows** (`useRowCover`): one shared `IntersectionObserver`, rooted at MainView's scrolling
  list (`#main-scroll`) with a 400 px margin, looks a row's cover up only once it's near view. A
  big library doesn't ask Rust for every file's art at startup.
- **No art**: `TrackCover` shows a placeholder tile with a music or video icon; video files with
  real art get a small video badge so the media type stays visible.

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

`resolve_stream(platform, video_id, video)` asks yt-dlp (`--dump-json -f ...`) for two URLs:
one with the picture and one with the sound. With video off, or when there's no usable picture
stream, it returns sound only.

- **YouTube** only offers picture and sound in one stream at 360p (format 18); everything
  sharper is video-only. So: a video-only https stream up to 1080p (avc1 preferred, since every
  WebView decodes it; YouTube's HLS formats are skipped) and an m4a audio stream.
- **Twitch** serves only HLS (`m3u8`), and every quality also carries sound. The WebViews play
  HLS natively (WebView2/Chromium, WKWebView), which matters because Twitch's CDN allows CORS
  only for twitch.tv, so hls.js couldn't fetch it. `--audio-multistreams` pairs a ≤720p stream
  with the `Audio_Only` rendition; the picture stream then plays muted like YouTube's.
- In a pair, the picture is whichever entry has one (even if it has sound too), and the sound is
  the other (`parse_resolved`).
- **Twitch live** (`video_id` = `live:<channel>`) can't play natively, for two reasons found by
  testing on Edge 155: the live playlist server (`*.playlist.ttvnw.net`) answers 403 to any
  `Origin` that isn't twitch.tv, and live segments are MPEG-TS, which the built-in HLS player
  rejects (VODs are fMP4). So live goes through **hls.js** (`src/utils/liveHls.ts`, loaded on
  first use): it converts the segments for Media Source Extensions, and its playlist loader calls
  the Rust command `fetch_live_playlist`, which fetches without an Origin (only https
  `*.ttvnw.net`). Segments load directly; their servers allow any origin. `ResolvedStream.live`
  is decided by that host, not by yt-dlp's `is_live`: the VOD of a broadcast still going is
  "live" to yt-dlp but comes from the VOD CDN and plays natively.
- **Live in the UI**: the channel list checks `twitch.tv/<channel>` while it lists the VODs
  (both ~1.8 s, run in parallel) and puts the stream on top (its real title is yt-dlp's
  `description`). Rows show **LIVE** instead of a duration and have no download buttons; the
  player bar shows the channel name and, in the seek bar's place, a pulsing **LIVE** badge
  (`LiveIndicator`); the `←→ seek` hint is hidden and seeking does nothing. Toggling video or recovering
  from an error restarts at the live edge. hls.js fatal errors use the same re-resolve-and-retry
  path as expired URLs.
- **Channels in the sidebar**: the Twitch channels in the play log (`twitchChannels` in
  `utils/plays.ts`: `live:<channel>` entries and VOD uploaders, most recent first, 10 at most).
  `useTwitchLiveStatus` (mounted in `MainView`) asks `twitch_live_status` at startup, every 5
  minutes, and when the set of channels changes; it runs the same yt-dlp live check as the channel
  listing, one per channel in parallel, and the result is `online.liveChannels` (the LIVE dots).

- The sound plays in the `<audio>` element, which stays the master: play, pause, seek, volume,
  `timeupdate` and `ended` all go through it, as for any audio track.
- The picture plays muted in the `<video>` (portaled into the video pane). `useVideoSync`
  mirrors play/pause/seek/rate onto it and pauses it while the audio buffers. Small drift
  (> 40 ms) is closed by running the video 10% faster or slower for a moment; more than 0.3 s
  snaps it to the audio's time. The audio is never paused for the video.
- The player bar's video button toggles `online.video`; the current track is re-resolved
  and resumes where it was. Audio-only lasts for that track: picking or skipping to another
  one turns video back on (YouTube and Twitch always have it), and it isn't saved.
- Stream URLs expire after a few hours. An `error` on either element re-resolves both and resumes
  (at most every 10 s).

### Downloads (`download.rs`)

`download_media(platform, video_id, kind)` saves a search result into a scanned folder, so it
becomes a local track: audio as m4a in `~/Music/<YouTube|Twitch>`, video as mp4 in
`~/Videos/<YouTube|Twitch>` (albums "YouTube" and "Twitch" in the library). Files are named
`<title> [<id>].<ext>` (Twitch ids look like `v2905135575`); an existing file with that id is
returned without downloading again. Ids are validated per platform (`online::media_url`).

- **ffmpeg is optional** (`ytdlp::locate_ffmpeg`: `PATH`, then Homebrew/pipx dirs). With it:
  YouTube video up to 1080p (avc1 + m4a merged into mp4), and title/artist/cover embedded.
  Without it: the m4a audio stream as is, or YouTube's 360p stream with picture and sound
  (format 18).
- **Twitch**: video is one ≤720p stream (it has sound, so nothing to merge; ~1.4 GB per hour),
  audio the `Audio_Only` rendition (~60–90 MB per hour; without ffmpeg it's saved as `.m4a`
  directly, since it's already AAC in MP4). VODs are thousands of 10 s HLS fragments, fetched 8
  at a time (`-N 8`).
- Runs through `ytdlp::run_streaming`, which reads yt-dlp's output line by line. A progress
  template prints `PROGRESS <downloaded> <total> <estimate>` lines, which become
  `download_progress { platform, video_id, kind, downloaded, total }` events (≤ 4/s). A video download
  reports its video and audio parts in turn.
- The finished file is found by its `[<id>]` name rather than from yt-dlp's printed path, which
  Windows consoles can mangle for non-ASCII titles.
- **Frontend**: `DownloadButton`s on each online result row track their status in
  `online.downloads` (progress is listened to in `MainView`). When a download lands, `scanLibrary()` (`api/local.ts`) rescans;
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
  calls it at startup. The ONLINE section shows a download panel while yt-dlp is missing; it's
  hidden only on platforms with no yt-dlp build to download.
- `src-tauri/tauri.bundle-yt-dlp.conf.json` adds yt-dlp back as `externalBin` for installers that
  should ship it: `bun run tauri build --config src-tauri/tauri.bundle-yt-dlp.conf.json`.

## Custom Hooks (`src/hooks/`)

| Hook             | Purpose                                                      |
| ---------------- | ------------------------------------------------------------ |
| `useScan`        | Mounts scan listeners, runs the first `scanLibrary()`        |
| `useDurations`   | Lazily fills track durations via `<audio>` metadata          |
| `useAudioPlayer` | Audio/video playback, seek, keyboard shortcuts, stream resolve |
| `usePlayLog`     | Adds the current track (local or online) to `plays` after 30 s of playback |
| `useTwitchChannels` / `useTwitchLiveStatus` | The play log's Twitch channels; their live dots every 5 min |
| `useLibraryIndex` | Every library file by path, with its folder and album       |
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

- Default `:root` — dark mode (low-saturation slate gradient with a hint of violet + amber accent)
- `[data-theme="light"]` — warm cream paper with warm browns for text and a deep Mirror's Edge
  red accent; no star field. Text tokens keep ≥ 4.5:1 contrast on the whole gradient.

Theme toggled via `useAppStore(s => s.setTheme)`. Setting persists to
localStorage and applies via `document.documentElement.dataset.theme`.

Background gradients on `body` provide visual depth that's preserved by
translucent panel surfaces (`bg-app-bg/80`).

The sidebar, top bar and player bar sit on their own surface, `bg-app-bar`, with a soft
`--color-app-bar-shadow` toward the list, so they don't blend into it: deeper than the list in the
dark theme, lighter (raised paper) in the light theme, where a deeper cream would cost text contrast.

## Custom Window Chrome

- `tauri.conf.json` — `transparent: true, decorations: false`
- `components/TopBar.tsx` — draws minimize/maximize/close and the drag region; the
  matching window permissions are in `src-tauri/capabilities/default.json`
- `body` background uses linear gradient, panels use translucent backgrounds

## Persistence

Stored in localStorage:

- `playmusic-theme` — current theme
- `playmusic-view` — the page shown (`nav.view`)
- `playmusic-volume` — last volume setting
- `playmusic-collapsed` — Set of collapsed album keys
- `playmusic-playerbar-height` — last drag-resized player bar height
- `playmusic-videopane-width` — last drag-resized video pane width
- `playmusic-online-platform` — the selected ONLINE tab (youtube or twitch)
- `playmusic-plays` — the play log (`plays`)
- `playmusic-recent-collapsed` — whether the recently played section is folded
- (`playmusic-history` / `playmusic-history-collapsed`, from the old watch history, are migrated
  into those and removed at startup)

Cover thumbnails are cached in the OS app cache dir (cleared if the app is uninstalled).

## Constants & Utilities

- `src/constants.ts` — `VIDEO_EXTS`, `AUDIO_EXTS`, `isVideo()`, `isAudio()`
- `src/utils/filterDirs.ts` — fuzzy search via Fuse.js with weighted fields; `plays.ts` does the same for the play log (`filterPlays`), and ranks Most listened
- `src/utils/trackName.ts` — `displayName()`: file name without extension or the YouTube/Twitch `[id]`
- `src/utils/format.ts` — `formatDuration()`, `formatRelative()`
- `src/components/TrackRow.tsx` / `TrackCover.tsx` — the one row layout and cover tile shared by
  library tracks, online results and the player bar
- `src/api/local.ts` — `scanLibrary()`; `src/api/online.ts` — `searchOnlineNow()`,
  `clearOnlineSearch()`, `selectPlatform()` and the IPC wrappers

## Conventions

- Colors in components use `text-app-*`, `bg-app-*`, `border-app-*` classes
  or `var(--color-app-*)` in inline styles. No hardcoded hex values or raw
  `slate-*` / `red-*` Tailwind classes.
- New shared state goes in the Zustand store, not React Context.
- State is grouped by source in the store: `library.*` for local files, `online.*` for
  YouTube/Twitch search, downloads and the video setting.
- Components subscribe selectively via `useAppStore(s => s.specificField)` to
  minimize re-renders.
- Heavy CPU/IO work runs in Rust commands, not in the WebView.
- Long-running operations emit progress events for streaming UI updates.
