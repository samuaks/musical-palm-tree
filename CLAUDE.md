# CLAUDE.md

Guidance for agents working in this repository.

## What this is

PlayMusic Desktop (repo name `musical-palm-tree`): a Tauri 2 desktop media player.
React + TypeScript UI in `src/`, Rust backend in `src-tauri/`. It's a companion to the
Go/Bubble Tea terminal player [PlayMusic](https://github.com/samuaks/playmusic), and is
meant to be a learning-friendly, fork-friendly codebase. Windows is the primary target;
macOS and Linux are also built.

Mental model: React owns UI and state, Tauri IPC connects it to Rust, and Rust does the
heavy filesystem and media work. `ARCHITECTURE.md` has the full picture and a suggested
reading order. Where it or `README.md` disagrees with the code, trust the code.

## Commands

Tool versions are pinned in `mise.toml` (bun, node). Rust is stable via rustup.

```bash
bun install
bun run tauri dev       # run the app (starts Vite on :1420)
bun run build           # tsc typecheck + Vite build into dist/
bun run tauri build     # platform installers in src-tauri/target/release/bundle/

cd src-tauri
cargo test              # Rust unit tests
cargo clippy --all-targets
```

There is no CI for tests or lint. `.github/workflows/publish.yml` only builds release
artifacts on pushes to `release`. Run the checks above yourself before pushing.

### Build prerequisites (Rust side)

Any `cargo check/test/build` runs `tauri-build`, which needs:

- **`dist/`** must exist (`frontendDist`). Run `bun run build` once, or create it empty.
- **Linux**: `libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libsoup-3.0-dev` (and
  `build-essential`, `libssl-dev`).

yt-dlp is **not** a build requirement. It's an optional runtime dependency that the app can
download and update itself (see `src-tauri/src/ytdlp.rs`). Only installers built with
`--config src-tauri/tauri.bundle-yt-dlp.conf.json` need `src-tauri/binaries/yt-dlp-<triple>`.

## Layout

```
src/
  App.tsx            root shell: Header, MainView + VideoPane, PlayerBar
  components/        Header (search), MainView (Library + OnlineSection), PlayerBar, ...
  hooks/             useScan, useAudioPlayer, useWaveform, useDurations, useResizable, ...
  store.ts           single Zustand store
  types.ts           TS mirrors of the Rust IPC structs
  api/               invoke wrappers, track adapters, scanLibrary() and searchOnlineNow()
src-tauri/src/
  lib.rs             registers commands and plugins
  scanner.rs         scan_media: walks ~/{Downloads,Music,Videos,Desktop,Documents}
  art.rs             cover_art: embedded or folder cover → cached thumbnail → data URL
  waveform.rs        generate_waveform: whole-track symphonia decode → ≤1024 points, cached
  online.rs          search_online / resolve_stream for YouTube and Twitch (parse yt-dlp output)
  download.rs        download_media: audio/video into ~/{Music,Videos}/{YouTube,Twitch}
  ytdlp.rs           finds, installs, updates and runs yt-dlp (optional, app-managed); finds ffmpeg
```

## IPC contract

- Rust structs sent to JS derive `serde::Serialize` with snake_case fields; their TS
  mirrors live in `src/types.ts`. **Change both sides together.** (`scanner.rs` has a test
  pinning `MediaFile`'s field names.)
- Commands: `scan_media`, `generate_waveform`, `cover_art`, `search_online`,
  `resolve_stream`, `fetch_live_playlist`, `download_media`, `yt_dlp_status`, `install_yt_dlp`. New commands must be added to `generate_handler!` in
  `lib.rs`. Window permissions live in `src-tauri/capabilities/default.json`; Rust-side
  process spawning (`tauri-plugin-shell`'s `command()`) isn't scoped by capabilities.
- Run yt-dlp only through `ytdlp::run` (or `ytdlp::run_streaming` for line-by-line output),
  which handle lookup, locking and update-and-retry.
- Scan events, listened to in `src/hooks/useScan.ts`: `scan_count` (files merged so far)
  and `scan_progress` (full `Directory[]` snapshot, throttled to ≤ 1 per 250 ms because
  each one re-serializes the whole tree). Rescan with `scanLibrary()` in `src/api/local.ts`.
- Download events: `download_progress` (`{ platform, video_id, kind, downloaded, total }`, ≤ 4/s),
  listened to in `src/components/MainView.tsx`.
- Local media files reach the WebView through the asset protocol (`convertFileSrc`),
  scoped to `$HOME/**` and `$APPCACHE/**` in `tauri.conf.json`. Cover art doesn't: it comes
  back from `cover_art` as a `data:` URL.

## Conventions

### Frontend

- Colors only via theme tokens: `text-app-*`, `bg-app-*`, `border-app-*`, or
  `var(--color-app-*)`. No hex values or raw `slate-*` / `red-*` Tailwind classes. Themes
  are defined in the `@theme` block of `src/App.css`.
- Shared state goes in the Zustand store, not React Context. It's grouped by source:
  `library.*` (local files) and `online.*` (platform tab, search results, downloads, video
  setting), with the search box's `query` and playback state at the root.
- Subscribe selectively: `useAppStore((s) => s.library.dirs)`, not the whole store.
- There's one main view: the search box filters the library as you type and searches online
  (YouTube, or a Twitch channel's VODs) only on Enter. Keep yt-dlp out of the per-keystroke path.
- localStorage keys use the `playmusic-` prefix.
- Prettier (`.prettierrc`): no semicolons, single quotes, 2-space indent, 100 columns.

### Rust

- Heavy CPU/IO work belongs in Rust commands, not the WebView. Long-running commands
  should be `async` and move blocking work into `tauri::async_runtime::spawn_blocking`,
  and stream progress through `app.emit` events.
- Prefer returning `Result<T, String>` from commands so the frontend can handle errors.
- Keep the Tauri-free logic in plain functions or structs so it can be unit-tested
  without an `AppHandle` (see `Library` and `collect_entries` in `scanner.rs`).
- The existing files aren't uniformly rustfmt-formatted. Format only the files you
  change (`rustfmt --edition 2021 src/<file>.rs`) so diffs stay focused.

## Testing

- Rust unit tests live inline at the bottom of each module in `#[cfg(test)] mod tests`.
  They use `tempfile::TempDir` for filesystem fixtures (dev-dependency).
- `scanner.rs` tests cover partial hashing, the directory walk, the cover-art cache
  and dedup/grouping. Follow that pattern for `waveform.rs` and `online.rs` (e.g. pull
  yt-dlp JSON parsing into a pure function and test it on sample lines).
- There are no frontend tests yet. If adding them, Vitest fits the existing Vite setup.

## Domain notes

- The scanner reaches 3 levels below each allowed dir. A file directly in the top dir has
  no album; otherwise the first subfolder is the album.
- Duplicates come from a partial MD5 of size + first 4 KiB + last 4 KiB. A match is a
  strong hint, not proof; hash the whole file before ever deleting anything.
- Cover art is extracted on demand (not during the scan): for the playing track, and for list
  rows as they scroll near view (`useRowCover`, never all at once). It's cached
  as 256 px thumbnails: `app_cache_dir/cover_<partial hash>.jpg`, or an empty
  `cover_<hash>.none` when there's no embedded art. Folder images (`cover.jpg` etc.) are the
  fallback and are never cached as "none". Changing the hash format invalidates the cache.
- Waveforms are generated in Rust because `AudioContext.decodeAudioData` loads whole files
  as PCM and crashes the WebView on long tracks. Don't move this back to JS. The decode streams
  the whole track in constant memory and is cached as `app_cache_dir/wave_v2_<hash>.bin`;
  bump the version if the output format or algorithm changes.
- `Cargo.toml` builds dependencies with `opt-level = 3` in dev: unoptimized symphonia makes a
  waveform for a long track take minutes in `tauri dev`. Keep that override.
- Online video plays as two streams: the picture muted in the `<video>`, following the
  `<audio>`, which stays the master for every control (`useVideoSync`). YouTube: a video-only
  https stream (prefer avc1) + m4a. Twitch VODs: HLS only, played natively by the WebView (its
  CDN allows CORS only for twitch.tv, so hls.js can't fetch it); a ≤720p stream is paired with
  `Audio_Only` via `--audio-multistreams`. yt-dlp can't search Twitch: the twitch tab lists a
  channel's VODs.
- Twitch **live** is the exception: MPEG-TS segments (the built-in HLS player only takes fMP4)
  behind a playlist server that rejects non-twitch.tv Origins. It plays through hls.js
  (`src/utils/liveHls.ts`, lazy-loaded) with playlists fetched by the Rust command
  `fetch_live_playlist` (no Origin; https `*.ttvnw.net` only). Whether a stream needs this is
  decided by its host (`ResolvedStream.live`), not yt-dlp's `is_live`, which is also true for
  the still-recording VOD of a live broadcast.

## Git and PRs

- **One branch per task, always based on the latest `main`.** When starting a feature or
  task that isn't a direct continuation of the current one, `git fetch origin main` and
  create a new branch from `origin/main`, even if you're already on a branch. Don't stack
  unrelated work on an existing branch, and never add commits to a branch whose PR is
  already merged: start a new branch from `main` (or rebase your unpushed commits onto
  it). Follow-ups to the current task (review fixes, small related edits) stay on its
  branch.
- Feature branches are usually `<issue-number>-<slug>`.
- **Never commit to `release`.** Pushing there publishes installers for every platform.
- Keep PRs small and focused, with a clear explanation, verification notes (what you ran)
  and screenshots for UI changes.

## Shipping tasks with review

- The `ship-task` skill (`.claude/skills/ship-task/`) takes tasks to open PRs: implement, run
  the checks, get a `VERDICT: PASS` from the `reviewer` agent (`.claude/agents/reviewer.md`),
  revise for at most 3 review rounds, then open the PR. Several tasks get one session and
  worktree each.
- The reviewer only reads and runs checks; it never edits. It can't judge looks, so UI PRs
  still need a visual check by a person.
- Each new worktree needs `bun install` and `bun run build`, and a cold Rust build if it touches
  `src-tauri/`. Only one `tauri dev` can run at a time (port 1420).
