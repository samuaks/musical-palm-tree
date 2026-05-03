import { MediaFile, LocalTrack } from '../types'

export function localTrack(file: MediaFile): LocalTrack {
  return { ...file, source: 'local' }
}
