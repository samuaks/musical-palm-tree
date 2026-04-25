import { ChevronDown, ChevronRight } from 'lucide-react'
import { useCollapsed } from '../hooks/useCollapsed'
import { Directory, MediaFile, ScanState } from '../types'
import { AlbumSkeleton } from './Skeleton'
import { TrackList } from './TrackList'

interface LibraryProps {
  dirs: Directory[]
  query: string
  currentTrack: MediaFile | null
  onPlay: (file: MediaFile) => void
  scanState: ScanState
  durations: Record<string, number>
}



export function Library({ dirs, query, currentTrack, onPlay, scanState, durations }: LibraryProps) {
  const filtered = dirs

  const {isCollapsed, toggle} = useCollapsed()


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
            durations={durations}
          />

          {dir.albums.map(album => {
            const key = `${dir.path}/${album.name}`
            const collapsed = isCollapsed(key)
             return (
              <div key={album.name}>
                <div
                  onClick={() => toggle(key)}
                  className="flex items-center gap-1 pl-4 pr-4 py-1 mt-2 cursor-pointer hover:bg-white/5 transition-colors"
                >
                  <div className="text-slate-600">
                    {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  </div>
                  <span className="text-xs text-slate-400 tracking-wide">
                    {album.name}
                  </span>
                  <span className="ml-2 text-xs text-slate-600 font-mono">
                    {album.files.length}
                  </span>
                </div>

                <div className={`pl-4 overflow-hidden transition-all duration-200 ${
                  collapsed ? 'max-h-0' : 'max-h-2499.75'
                }`}>
                  <TrackList
                    files={album.files}
                    currentTrack={currentTrack}
                    onPlay={onPlay}
                    query={query}
                    durations={durations}
                  />
                </div>
              </div>
            )
          }
          )}
        </div>
      ))}
    </div>
  )
}