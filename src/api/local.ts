import { invoke } from '@tauri-apps/api/core'
import { MediaFile, LocalTrack, ScanResult } from '../types'
import { useAppStore } from '../store'

export function localTrack(file: MediaFile): LocalTrack {
  return { ...file, source: 'local' }
}

/**
 * The track's cover as a `data:` URL (embedded art, or a cover image in its folder), or null.
 * Extracted and thumbnailed on demand by `art.rs`.
 */
export async function coverArt(path: string): Promise<string | null> {
  return invoke<string | null>('cover_art', { path })
}

let scanning: Promise<void> | null = null
let scanAgain = false

/**
 * Scans the library folders (`scan_media`) and puts the result in the store. Called at startup
 * and after a download lands. A call during a scan runs one more scan once it's done, so a file
 * added mid-scan is always picked up. Progress events are listened to in `useScan`.
 */
export function scanLibrary(): Promise<void> {
  if (scanning) {
    scanAgain = true
    return scanning
  }
  const { setLocalDirs, setLocalScanMeta, setLocalScanState } = useAppStore.getState()
  scanning = (async () => {
    do {
      scanAgain = false
      setLocalScanState('scanning')
      try {
        const r = await invoke<ScanResult>('scan_media')
        setLocalDirs(r.directories)
        setLocalScanMeta(r.metadata)
      } catch (e) {
        console.error('scan failed:', e)
      }
      setLocalScanState('done')
    } while (scanAgain)
  })().finally(() => {
    scanning = null
  })
  return scanning
}
