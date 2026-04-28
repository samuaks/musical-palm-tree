import { useMemo } from 'react'
import { useAppStore } from '../store'

export function usePlayer() {
  const currentTrack = useAppStore((s) => s.currentTrack)
  const setCurrentTrack = useAppStore((s) => s.setCurrentTrack)
  const dirs = useAppStore((s) => s.dirs)

  const allTracks = useMemo(() => {
    return dirs.flatMap((dir) => [...dir.files, ...dir.albums.flatMap((album) => album.files)])
  }, [dirs])

  function next() {
    if (!currentTrack) return
    const idx = allTracks.findIndex((f) => f.path === currentTrack.path)
    if (idx < allTracks.length - 1) setCurrentTrack(allTracks[idx + 1])
  }

  function prev() {
    if (!currentTrack) return
    const idx = allTracks.findIndex((f) => f.path === currentTrack.path)
    if (idx > 0) setCurrentTrack(allTracks[idx - 1])
  }

  return { next, prev }
}
