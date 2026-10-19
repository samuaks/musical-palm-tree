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

- **The yt-dlp sidecar**: `src-tauri/binaries/yt-dlp-<target-triple>` (e.g.
  `yt-dlp-x86_64-unknown-linux-gnu`, `yt-dlp-x86_64-pc-windows-msvc.exe`), declared as
  `externalBin` in `tauri.conf.json`. It is not checked in. For compile/test-only work an
  empty executable placeholder is enough; never commit one.
- **`dist/`** must exist (`frontendDist`). Run `bun run build` once, or create it empty.
- **Linux**: `libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libsoup-3.0-dev` (and
  `build-essential`, `libssl-dev`).

## Layout

```
src/
  App.tsx            root shell; player bar, video pane, volume persist across spaces
  spaces/            content "spaces" registered in spaces/index.tsx (Local, Online)
  components/        Library, TrackList, Track, PlayerBar, Waveform, VideoPane, ...
  hooks/             useScan, useAudioPlayer, useWaveform, useDurations, useResizable, ...
  store.ts           single Zustand store
  types.ts           TS mirrors of the Rust IPC structs
  api/               track adapters (MediaFile → LocalTrack) and online invoke wrappers
src-tauri/src/
  lib.rs             registers commands and plugins
  scanner.rs         scan_media: walks ~/{Downloads,Music,Videos,Desktop,Documents}
  waveform.rs        generate_waveform: symphonia decode of the first 60 s → 100 bars
  online.rs          search_online / resolve_stream via the yt-dlp sidecar
```

## IPC contract

- Rust structs sent to JS derive `serde::Serialize` with snake_case fields; their TS
  mirrors live in `src/types.ts`. **Change both sides together.** (`scanner.rs` has a test
  pinning `MediaFile`'s field names.)
- Commands: `scan_media`, `generate_waveform`, `search_online`, `resolve_stream`. New
  commands must be added to `generate_handler!` in `lib.rs`. Shell/sidecar and window
  permissions live in `src-tauri/capabilities/default.json`.
- Scan events, listened to in `src/hooks/useScan.ts`: `scan_count` (files merged so far)
  and `scan_progress` (full `Directory[]` snapshot, throttled to ≤ 1 per 250 ms because
  each one re-serializes the whole tree).
- Local files and cached art reach the WebView through the asset protocol
  (`convertFileSrc`), scoped to `$HOME/**` and `$APPCACHE/**` in `tauri.conf.json`.

## Conventions

### Frontend

- Colors only via theme tokens: `text-app-*`, `bg-app-*`, `border-app-*`, or
  `var(--color-app-*)`. No hex values or raw `slate-*` / `red-*` Tailwind classes. Themes
  are defined in the `@theme` block of `src/App.css`.
- Shared state goes in the Zustand store, not React Context. Per-space state is namespaced
  under `spaces.<id>` (e.g. `spaces.local.*`).
- Subscribe selectively: `useAppStore((s) => s.spaces.local.dirs)`, not the whole store.
- New space: add `src/spaces/MySpace.tsx` (+ header), register it in `SPACES` in
  `src/spaces/index.tsx`, and add state under `spaces` in `store.ts` if needed.
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
- Cover art is cached as `app_cache_dir/art_<hash>.jpg`; files with no art get an empty
  `art_<hash>.none` marker so they aren't re-parsed every scan. Changing the hash format
  invalidates the cache (it's re-extracted once).
- Waveforms are generated in Rust because `AudioContext.decodeAudioData` loads whole files
  as PCM and crashes the WebView on long tracks. Don't move this back to JS.

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
