// src/api/online.ts
import { invoke } from '@tauri-apps/api/core'
import {
  DownloadKind,
  Downloaded,
  OnlineSearchResult,
  OnlineTrack,
  ResolvedStream,
  YtDlpStatus,
} from '../types'

/** Whether yt-dlp is installed, and whether the app can install it. */
export async function ytDlpStatus(): Promise<YtDlpStatus> {
  return invoke<YtDlpStatus>('yt_dlp_status')
}

/** Downloads and verifies yt-dlp into the app's data dir; emits `yt_dlp_download` progress. */
export async function installYtDlp(): Promise<void> {
  return invoke<void>('install_yt_dlp')
}

export async function searchOnline(query: string): Promise<OnlineSearchResult[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  return invoke<OnlineSearchResult[]>('search_online', { query: trimmed })
}

/** Stream URLs for a video: audio, plus a video-only stream when `video` is on and available. */
export async function resolveStream(videoId: string, video: boolean): Promise<ResolvedStream> {
  return invoke<ResolvedStream>('resolve_stream', { videoId, video })
}

/**
 * Downloads a video's audio (m4a, into ~/Music/YouTube) or video (mp4, into ~/Videos/YouTube),
 * or returns the existing file. Emits `download_progress` events while it runs.
 */
export async function downloadMedia(videoId: string, kind: DownloadKind): Promise<Downloaded> {
  return invoke<Downloaded>('download_media', { videoId, kind })
}

/** Store key for one download: the same video can be downloaded as audio and as video. */
export function downloadKey(videoId: string, kind: DownloadKind): string {
  return `${videoId}:${kind}`
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
    ext: 'm4a', // not a video ext: video is decided when the stream is resolved
    duration_secs: result.duration_secs,
    size_bytes: 0,
    art_path: result.thumbnail, // already an https URL
    created_at: Date.now(),
    uploader: result.uploader ?? undefined,
  }
}
