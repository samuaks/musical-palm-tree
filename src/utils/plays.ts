import Fuse from 'fuse.js'
import { LocalPlay, OnlinePlay, PlayEntry, Platform } from '../types'

/** Most listened counts plays in this window. */
export const RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
/** The oldest entries drop off past this. */
export const PLAY_LOG_LIMIT = 500
/** Plays kept per entry within the window (enough to rank; caps a track on repeat). */
const RECENT_LIMIT = 200

/** Identifies one entry: the same file, or the same video/channel on the same platform. */
export function playKey(ref: LocalPlay | OnlinePlay): string {
  return ref.source === 'local' ? `local:${ref.path}` : streamKey(ref.platform, ref.video_id)
}

/** Store key for one online stream (also `online.failedStreams`'s key). */
export function streamKey(platform: Platform, videoId: string): string {
  return `${platform}:${videoId}`
}

/** Plays within the window before `now`. */
export function recentPlays(entry: PlayEntry, now: number): number[] {
  return entry.recent.filter((t) => now - t < RECENT_WINDOW_MS)
}

/** The log with `ref` played at `now`: moved to the top, its recent plays pruned to the window. */
export function withPlay(log: PlayEntry[], ref: LocalPlay | OnlinePlay, now: number): PlayEntry[] {
  const key = playKey(ref)
  const existing = log.find((e) => playKey(e) === key)
  const recent = [...(existing ? recentPlays(existing, now) : []), now].slice(-RECENT_LIMIT)
  const rest = log.filter((e) => playKey(e) !== key)
  return [{ ...ref, last_played: now, recent }, ...rest].slice(0, PLAY_LOG_LIMIT)
}

/**
 * What was played most in the last 30 days, most first (ties: played last first). Live channels
 * are left out: they're channels, not tracks.
 */
export function mostListened(log: PlayEntry[], now: number, limit: number): PlayEntry[] {
  return log
    .filter((e) => !(e.source === 'online' && e.live))
    .map((e) => ({ e, plays: recentPlays(e, now).length }))
    .filter(({ plays }) => plays > 0)
    .sort((a, b) => b.plays - a.plays || b.e.last_played - a.e.last_played)
    .slice(0, limit)
    .map(({ e }) => e)
}

/** Entries matching the search box, fuzzy like `filterDirs`, kept in log order. */
export function filterPlays(log: PlayEntry[], query: string): PlayEntry[] {
  if (!query) return log
  const fuse = new Fuse(log, {
    keys: [
      { name: 'title', weight: 2 },
      { name: 'name', weight: 2 },
      { name: 'uploader', weight: 1 },
    ],
    threshold: 0.4,
    ignoreLocation: true,
    minMatchCharLength: 2,
  })
  const matches = new Set(fuse.search(query).map((r) => r.item))
  return log.filter((e) => matches.has(e))
}

/** Keeps the entries that have what a row needs; anything else in storage is dropped. */
export function validPlays(parsed: unknown): PlayEntry[] {
  if (!Array.isArray(parsed)) return []
  return parsed.filter(
    (e): e is PlayEntry =>
      typeof e?.last_played === 'number' &&
      Array.isArray(e.recent) &&
      e.recent.every((t: unknown) => typeof t === 'number') &&
      ((e.source === 'local' && typeof e.path === 'string' && typeof e.name === 'string') ||
        (e.source === 'online' &&
          (e.platform === 'youtube' || e.platform === 'twitch') &&
          typeof e.video_id === 'string' &&
          typeof e.title === 'string'))
  )
}

/**
 * Turns the old online-only watch history (`playmusic-history`) into play-log entries: each
 * was watched once, at `watched_at`.
 */
export function migrateHistory(parsed: unknown): PlayEntry[] {
  if (!Array.isArray(parsed)) return []
  return parsed
    .filter(
      (e) =>
        (e?.platform === 'youtube' || e?.platform === 'twitch') &&
        typeof e.video_id === 'string' &&
        typeof e.title === 'string' &&
        typeof e.watched_at === 'number'
    )
    .map((e) => ({
      source: 'online' as const,
      platform: e.platform as Platform,
      video_id: e.video_id as string,
      title: e.title as string,
      uploader: typeof e.uploader === 'string' ? e.uploader : null,
      thumbnail: typeof e.thumbnail === 'string' ? e.thumbnail : null,
      duration_secs: typeof e.duration_secs === 'number' ? e.duration_secs : 0,
      live: e.live === true,
      last_played: e.watched_at as number,
      recent: [e.watched_at as number],
    }))
}

/** A Twitch channel from the play log: its login `name` (lowercase), and how to show it. */
export interface TwitchChannel {
  name: string
  display: string
}

/** Twitch login names: 3–25 letters, digits or underscores (as `is_channel_name` in online.rs). */
export function isChannelName(name: string): boolean {
  return /^[a-z0-9_]{3,25}$/i.test(name)
}

/**
 * The Twitch channels in the play log, most recently played first: channels watched live
 * (`live:<channel>`) and the channels of watched VODs. `keep` picks which (e.g. not hidden).
 */
export function twitchChannels(
  log: PlayEntry[],
  limit: number,
  keep: (name: string) => boolean = () => true
): TwitchChannel[] {
  const seen = new Map<string, TwitchChannel>()
  for (const e of log) {
    if (e.source !== 'online' || e.platform !== 'twitch') continue
    const login = e.live ? e.video_id.slice('live:'.length) : e.uploader
    if (!login || !isChannelName(login)) continue
    const name = login.toLowerCase()
    if (!keep(name)) continue
    if (!seen.has(name)) seen.set(name, { name, display: e.uploader ?? login })
    if (seen.size === limit) break
  }
  return [...seen.values()]
}
