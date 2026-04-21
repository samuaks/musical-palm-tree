import { Directory, MediaFile, ScanState } from '../types'
import { AlbumSkeleton } from './Skeleton'
import { TrackList } from './TrackList'

interface LibraryProps {
  dirs: Directory[]
  query: string
  currentTrack: MediaFile | null
  onPlay: (file: MediaFile) => void
  scanState: ScanState
}

function filterDirs(dirs: Directory[], query: string): Directory[] {
  if (!query) return dirs
  const q = query.toLowerCase()

  return dirs.reduce<Directory[]>((acc, dir) => {
    const filteredFiles = dir.files.filter(f =>
      f.name.toLowerCase().includes(q)
    )
    const filteredAlbums = dir.albums.reduce<typeof dir.albums>((aalc, album) => {
      const files = album.files.filter(f => f.name.toLowerCase().includes(q))
      if (files.length > 0) aalc.push({ ...album, files })
      return aalc
    }, [])

    if (filteredFiles.length > 0 || filteredAlbums.length > 0) {
      acc.push({ ...dir, files: filteredFiles, albums: filteredAlbums })
    }
    return acc
  }, [])
}

export function Library({ dirs, query, currentTrack, onPlay, scanState }: LibraryProps) {
  const filtered = filterDirs(dirs, query)


 if (scanState === 'scanning' && dirs.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto py-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <AlbumSkeleton key={i} />
        ))}
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto py-2">
      {scanState === 'scanning' && (
        <div className="px-4 py-1 text-xs text-slate-600 font-mono animate-pulse">
          scanning...
        </div>
      )}

      {filtered.length === 0 && scanState === 'done' && (
        <div className="px-4 py-3 text-xs text-slate-600 font-mono">
          {query ? 'no results.' : 'no media found.'}
        </div>
      )}

      {filtered.map(dir => (
        <div key={dir.path} className="mb-4">
          <div className="px-4 py-1 text-xs text-slate-500 uppercase tracking-widest mt-3">
            {dir.name}
          </div>

          <TrackList
            files={dir.files}
            currentTrack={currentTrack}
            onPlay={onPlay}
            query={query}
          />

          {dir.albums.map(album => (
            <div key={album.name}>
              <div className="pl-8 py-1 text-xs text-slate-400 tracking-wide mt-2">
                {album.name}
              </div>
              <div className="pl-4">
                <TrackList
                    query={query}
                  files={album.files}
                  currentTrack={currentTrack}
                  onPlay={onPlay}
                />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}