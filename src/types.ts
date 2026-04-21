export interface MediaFile {
  path: string
  name: string
  ext: string
}

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
  duration_ms : number
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