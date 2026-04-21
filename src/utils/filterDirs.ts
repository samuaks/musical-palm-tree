import Fuse from 'fuse.js'
import { Directory, MediaFile } from '../types'

export function filterDirs(dirs: Directory[], query: string): Directory[] {
  if (!query) return dirs

  // flatten all files with directory/album context for fuse
  type IndexedFile = {
    file: MediaFile
    dirName: string
    albumName: string | null
  }

  const indexed: IndexedFile[] = dirs.flatMap(dir => [
    ...dir.files.map(f => ({ file: f, dirName: dir.name, albumName: null })),
    ...dir.albums.flatMap(album =>
      album.files.map(f => ({ file: f, dirName: dir.name, albumName: album.name }))
    )
  ])

  const fuse = new Fuse(indexed, {
    keys: [
      { name: 'file.name', weight: 2 },
      { name: 'albumName', weight: 1 },
      { name: 'dirName', weight: 0.5 }
    ],
    threshold: 0.4,
    ignoreLocation: true,
    minMatchCharLength: 2,
  })

  const results = fuse.search(query).map(r => r.item)

  // rebuild directory structure from results
  const dirMap = new Map<string, Directory>()

  for (const { file, dirName, albumName } of results) {
    if (!dirMap.has(dirName)) {
      const original = dirs.find(d => d.name === dirName)
      if (!original) continue
      dirMap.set(dirName, {
        name: original.name,
        path: original.path,
        files: [],
        albums: [],
      })
    }

    const dir = dirMap.get(dirName)!

    if (albumName) {
      let album = dir.albums.find(a => a.name === albumName)
      if (!album) {
        album = { name: albumName, files: [] }
        dir.albums.push(album)
      }
      album.files.push(file)
    } else {
      dir.files.push(file)
    }
  }

  return Array.from(dirMap.values())
}

export function flattenFiles(dirs: Directory[]): MediaFile[] {
  return dirs.flatMap(dir => [
    ...dir.files,
    ...dir.albums.flatMap(album => album.files)
  ])
}