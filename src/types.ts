export interface MediaFile {
  path: string
  name: string
  ext: string
  duration_secs: number
  size_bytes: number
  art_path: string | null
  created_at: number
}

export interface LocalTrack extends MediaFile {
  source: 'local'
}

export interface OnlineTrack {
  source: 'online'
  videoId: string
  // mirror MediaFile field names so existing consumers Just Work
  path: string // = videoId, used as stable identifier (NOT a filesystem path)
  name: string // video title
  ext: string // 'webm' | 'm4a' | 'mp4' — whatever yt-dlp's bestaudio returns
  duration_secs: number // from search metadata
  size_bytes: number // 0 (unknown for streams)
  art_path: string | null // YouTube thumbnail URL (https://...)
  created_at: number // upload timestamp from yt-dlp, or Date.now()

  // online-only
  uploader?: string
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
