import { useMemo } from 'react'
import { useAppStore } from '../store'
import { MediaFile } from '../types'

export interface IndexedFile {
  file: MediaFile
  dirName: string
  albumName: string | null
}

/** Every library file by path, with the folder and album it's listed under. */
export function useLibraryIndex(): Map<string, IndexedFile> {
  const dirs = useAppStore((s) => s.library.dirs)
  return useMemo(() => {
    const index = new Map<string, IndexedFile>()
    for (const dir of dirs) {
      for (const file of dir.files)
        index.set(file.path, { file, dirName: dir.name, albumName: null })
      for (const album of dir.albums) {
        for (const file of album.files) {
          index.set(file.path, { file, dirName: dir.name, albumName: album.name })
        }
      }
    }
    return index
  }, [dirs])
}
