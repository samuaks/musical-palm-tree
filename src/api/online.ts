// src/api/online.ts
import { invoke } from '@tauri-apps/api/core'
import { OnlineSearchResult, OnlineTrack } from '../types'

export async function searchOnline(query: string): Promise<OnlineSearchResult[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  return invoke<OnlineSearchResult[]>('search_online', { query: trimmed })
}

export async function resolveStream(videoId: string): Promise<string> {
  return invoke<string>('resolve_stream', { videoId })
}

/**
 * Convert a yt-dlp search result into a Track that can be played.
 * The actual stream URL is resolved lazily inside useMediaPlayer
 * (yt-dlp URLs expire, so we don't store them).
 */
export function resultToTrack(result: OnlineSearchResult): OnlineTrack {
  return {
    source: 'online',
    videoId: result.video_id,
    path: result.video_id, // used as stable id by existing UI
    name: result.title,
    ext: 'webm', // bestaudio default; not used for routing
    duration_secs: result.duration_secs,
    size_bytes: 0,
    art_path: result.thumbnail, // already an https URL
    created_at: Date.now(),
    uploader: result.uploader ?? undefined,
  }
}
