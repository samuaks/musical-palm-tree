// src/api/online.ts
import { invoke } from '@tauri-apps/api/core'
import {
  DownloadKind,
  Downloaded,
  OnlinePlay,
  OnlineSearchResult,
  OnlineTrack,
  Platform,
  ResolvedStream,
  YtDlpStatus,
} from '../types'
import { useAppStore } from '../store'

/** Whether yt-dlp is installed, and whether the app can install it. */
export async function ytDlpStatus(): Promise<YtDlpStatus> {
  return invoke<YtDlpStatus>('yt_dlp_status')
}

/** Downloads and verifies yt-dlp into the app's data dir; emits `yt_dlp_download` progress. */
export async function installYtDlp(): Promise<void> {
  return invoke<void>('install_yt_dlp')
}

/**
 * YouTube: a text search. Twitch: the query is a channel name, and its recent VODs are listed.
 * A pasted YouTube or Twitch link opens that video (or channel) on either platform.
 */
export async function searchOnline(
  query: string,
  platform: Platform
): Promise<OnlineSearchResult[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  return invoke<OnlineSearchResult[]>('search_online', { query: trimmed, platform })
}

/** Whether each Twitch channel (login name) is live right now; the first 10 are checked. */
export async function twitchLiveStatus(channels: string[]): Promise<boolean[]> {
  return invoke<boolean[]>('twitch_live_status', { channels })
}

let searchSeq = 0

/**
 * Searches the selected platform (`online.platform`) for `query` and puts the results in the
 * store (`online.*`). Runs on Enter, not while typing. A newer search wins over a slower older
 * one.
 */
export async function searchOnlineNow(query: string): Promise<void> {
  const trimmed = query.trim()
  const { ytDlp, online, setOnlineResults, setOnlineSearchState, setOnlineSearchError } =
    useAppStore.getState()
  if (!trimmed || ytDlp?.available === false) return

  const seq = ++searchSeq
  setOnlineSearchState('searching')
  setOnlineSearchError(null)
  try {
    const results = await searchOnline(trimmed, online.platform)
    if (seq !== searchSeq) return
    setOnlineResults(trimmed, results)
    setOnlineSearchState('done')
  } catch (e) {
    if (seq !== searchSeq) return
    setOnlineSearchError(typeof e === 'string' ? e : String(e))
    setOnlineSearchState('error')
  }
}

/** Drops the online results, and any search still running. */
export function clearOnlineSearch() {
  searchSeq++
  useAppStore.getState().clearOnlineSearch()
}

/** Switches the ONLINE tab; results (and any search still running) belong to the old one. */
export function selectPlatform(platform: Platform) {
  searchSeq++
  useAppStore.getState().setOnlinePlatform(platform)
}

/** Stream URLs for a video: audio, plus a picture stream when `video` is on and available. */
export async function resolveStream(
  platform: Platform,
  videoId: string,
  video: boolean
): Promise<ResolvedStream> {
  return invoke<ResolvedStream>('resolve_stream', { platform, videoId, video })
}

/**
 * Downloads a video's audio (m4a, into ~/Music/<YouTube|Twitch>) or video (mp4, into
 * ~/Videos/<YouTube|Twitch>), or returns the existing file. Emits `download_progress` events
 * while it runs.
 */
export async function downloadMedia(
  platform: Platform,
  videoId: string,
  kind: DownloadKind
): Promise<Downloaded> {
  return invoke<Downloaded>('download_media', { platform, videoId, kind })
}

/** Store key for one download: the same video can be downloaded as audio and as video. */
export function downloadKey(platform: Platform, videoId: string, kind: DownloadKind): string {
  return `${platform}:${videoId}:${kind}`
}

/**
 * Convert a yt-dlp search result into a Track that can be played.
 * The actual stream URL is resolved lazily inside useMediaPlayer
 * (yt-dlp URLs expire, so we don't store them).
 */
export function resultToTrack(result: OnlineSearchResult): OnlineTrack {
  return {
    source: 'online',
    platform: result.platform,
    videoId: result.video_id,
    path: result.video_id, // used as stable id by existing UI
    name: result.title,
    ext: 'm4a', // not a video ext: video is decided when the stream is resolved
    duration_secs: result.duration_secs,
    size_bytes: 0,
    art_path: result.thumbnail, // already an https URL
    created_at: result.timestamp ? result.timestamp * 1000 : Date.now(),
    uploader: result.uploader ?? undefined,
    live: result.live,
  }
}

/** A play-log entry as a track to play again. */
export function onlinePlayToTrack(entry: OnlinePlay): OnlineTrack {
  return resultToTrack({ ...entry, view_count: null, timestamp: null })
}

/** What the play log keeps of an online track. */
export function trackToOnlinePlay(track: OnlineTrack): OnlinePlay {
  return {
    source: 'online',
    platform: track.platform,
    video_id: track.videoId,
    title: track.name,
    uploader: track.uploader ?? null,
    thumbnail: track.art_path,
    duration_secs: track.duration_secs,
    live: track.live ?? false,
  }
}
