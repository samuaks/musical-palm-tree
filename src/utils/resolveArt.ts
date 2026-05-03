import { convertFileSrc } from '@tauri-apps/api/core'
import { Track } from '../types'

export function resolveArt(track: Track): string | null {
  if (!track.art_path) return null
  return track.source === 'local' ? convertFileSrc(track.art_path) : track.art_path
}
