export interface MediaFile {
  path: string
  name: string
  ext: string
  duration_secs: number
  size_bytes: number
  created_at: number
}

export interface LocalTrack extends MediaFile {
  source: 'local'
}

export interface OnlineTrack {
  source: 'online'
  platform: Platform
  videoId: string
  // mirror MediaFile field names so existing consumers Just Work
  path: string // = videoId, used as stable identifier (NOT a filesystem path)
  name: string // video title
  ext: string // 'm4a'; whether video plays is decided when the stream is resolved
  duration_secs: number // from search metadata
  size_bytes: number // 0 (unknown for streams)
  art_path: string | null // YouTube or Twitch thumbnail URL (https://...)
  created_at: number // upload timestamp from yt-dlp, or Date.now()

  // online-only
  uploader?: string
  live?: boolean // a live stream: no duration, no seeking
}

export type Track = LocalTrack | OnlineTrack

export interface Album {
  name: string
  files: MediaFile[]
}

export interface Directory {
  name: string
  path: string
  albums: Album[]
  files: MediaFile[]
}

export interface ScanMetaData {
  duration_ms: number
  total_files: number
  total_albums: number
  total_directories: number
  total_duplicates: number
}
export interface ScanResult {
  metadata: ScanMetaData
  directories: Directory[]
  duplicates: string[][]
}

export type ScanState = 'idle' | 'scanning' | 'done'
export type OnlineSearchState = 'idle' | 'searching' | 'done' | 'error'

/** Mirrors `online::Platform`: where an online result comes from. */
export type Platform = 'youtube' | 'twitch'

/** Mirrors `online::OnlineSearchResult`. */
export interface OnlineSearchResult {
  platform: Platform
  video_id: string // YouTube id, or Twitch VOD id (`v2905135575`)
  title: string
  duration_secs: number
  thumbnail: string | null
  uploader: string | null // for Twitch channel lists: the channel
  view_count: number | null
  timestamp: number | null // published or broadcast, Unix seconds
  live: boolean // a Twitch channel live right now; video_id is `live:<channel>`
}

/** Mirrors `online::ResolvedStream` in src-tauri/src/online.rs. */
export interface ResolvedStream {
  audio_url: string
  video_url: string | null // video-only stream, played muted and synced to the audio
  height: number | null
  live: boolean // play through hls.js (see src/utils/liveHls.ts)
}

/** Mirrors `ytdlp::Status` in src-tauri/src/ytdlp.rs. */
export interface YtDlpStatus {
  available: boolean
  can_install: boolean // the app can download yt-dlp itself on this platform
  ffmpeg: boolean // found: HD video downloads and tagged audio
}

/** Mirrors `download::Kind` in src-tauri/src/download.rs. */
export type DownloadKind = 'audio' | 'video'

/** Mirrors `download::Downloaded`. */
export interface Downloaded {
  path: string
  kind: DownloadKind
}

/** Payload of the `download_progress` event (`download::DownloadProgress`). */
export interface DownloadProgress {
  platform: Platform
  video_id: string
  kind: DownloadKind
  downloaded: number
  total: number | null
}

export interface DownloadStatus {
  state: 'downloading' | 'done' | 'error'
  percent: number | null
  path?: string
  error?: string
}

export interface YtDlpDownloadProgress {
  downloaded: number
  total: number | null
}
