import { useState, useMemo } from 'react'
import { Directory, MediaFile } from '../types'

export function usePlayer(dirs: Directory[]) {
  const [currentTrack, setCurrentTrack] = useState<MediaFile | null>(null)

  const allTracks = useMemo(() => {
    return dirs.flatMap(dir => [
      ...dir.files,
      ...dir.albums.flatMap(album => album.files)
    ])
  }, [dirs])

  function play(file: MediaFile) {
    setCurrentTrack(file)
  }

  function next() {
    if (!currentTrack) return
    const idx = allTracks.findIndex(f => f.path === currentTrack.path)
    if (idx < allTracks.length - 1) setCurrentTrack(allTracks[idx + 1])
  }

  function prev() {
    if (!currentTrack) return
    const idx = allTracks.findIndex(f => f.path === currentTrack.path)
    if (idx > 0) setCurrentTrack(allTracks[idx - 1])
  }

  return { currentTrack, play, next, prev }
}