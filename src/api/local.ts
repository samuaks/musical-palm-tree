import { invoke } from '@tauri-apps/api/core'
import { MediaFile, LocalTrack } from '../types'

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
