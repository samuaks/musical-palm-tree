import { useMemo } from 'react'
import { useAppStore } from '../store'
import { localTrack } from '../api/local'
import { LocalTrack } from '../types'

/**
 * Flattened list of all local tracks across all dirs and albums,
 * each tagged as a LocalTrack ready to be enqueued.
 *
 * The order matches the visual order in the Library — that's
 * the order prev/next should follow when playing from local.
 */
export function useLocalFlatTracks(): LocalTrack[] {
  const dirs = useAppStore((s) => s.spaces.local.dirs)
  return useMemo(() => {
    return dirs.flatMap((dir) => [
      ...dir.files.map(localTrack),
      ...dir.albums.flatMap((album) => album.files.map(localTrack)),
    ])
  }, [dirs])
}
