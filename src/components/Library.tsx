import { ChevronDown, ChevronRight } from 'lucide-react'
import { AlbumSkeleton } from './Skeleton'
import { TrackList } from './TrackList'
import { useAppStore } from '../store'
import { ReactNode, useMemo } from 'react'
import { filterDirs } from '../utils/filterDirs'
import { SourceHeader } from './SourceHeader'
import { Directory } from '../types'

/** The library's folders and albums, filtered by the search box. `only` limits it to some folders. */
export function Library({ only }: { only?: Directory[] }) {
  const allDirs = useAppStore((s) => s.library.dirs)
  const dirs = only ?? allDirs
  const query = useAppStore((s) => s.query)
  const scanState = useAppStore((s) => s.library.scanState)
  const collapsed = useAppStore((s) => s.library.collapsed)
  const toggleCollapsed = useAppStore((s) => s.toggleLibraryCollapsed)

  const filtered = useMemo(() => filterDirs(dirs, query), [dirs, query])
  const searching = query.trim() !== ''
  const matches = filtered.reduce(
    (sum, dir) => sum + dir.files.length + dir.albums.reduce((n, a) => n + a.files.length, 0),
    0
  )

  if (scanState === 'scanning' && dirs.length === 0) {
    return (
      <div>
        {Array.from({ length: 3 }).map((_, i) => (
          <AlbumSkeleton key={i} />
        ))}
      </div>
    )
  }

  return (
    <div>
      {searching && <SourceHeader name="library" count={matches} />}

      {scanState === 'scanning' && (
        <div className="px-4 py-1 text-xs text-app-muted font-mono animate-pulse">scanning...</div>
      )}

      {filtered.length === 0 && scanState === 'done' && (
        <div className="px-6 py-3 text-xs text-app-muted font-mono">
          {searching ? 'no matches in your library.' : 'no media found.'}
        </div>
      )}

      {filtered.map((dir) => (
        <div key={dir.path} className="mb-2">
          <SectionHeader
            name={dir.name}
            count={dir.files.length + dir.albums.reduce((sum, a) => sum + a.files.length, 0)}
          />

          <TrackList files={dir.files} dirName={dir.name} />

          {dir.albums.map((album) => {
            const key = `${dir.name}/${album.name}`
            const isAlbumCollapsed = collapsed.has(key)

            return (
              <div key={album.name}>
                <div
                  onClick={() => toggleCollapsed(key)}
                  className={`flex items-center gap-3 px-6 mt-3 cursor-pointer transition-colors py-1 ${
                    isAlbumCollapsed ? 'bg-app-hover' : 'hover:bg-app-hover'
                  }`}
                >
                  <div className="text-app-muted">
                    {isAlbumCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  </div>
                  <span className="text-xs font-mono text-app-secondary tracking-wide shrink-0">
                    {album.name}
                  </span>
                  <div className="flex-1 h-px bg-app-border" />
                  <span className="text-xs font-mono text-app-muted tabular-nums shrink-0">
                    {album.files.length}
                  </span>
                </div>

                {!isAlbumCollapsed && (
                  <TrackList files={album.files} dirName={dir.name} albumName={album.name} />
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/** Heads a top-level folder (and the Home page's lists): accent name, a rule, the count. */
export function SectionHeader({
  name,
  count,
  children,
}: {
  name: string
  count?: number
  /** Extra controls before the count (e.g. "see all"). */
  children?: ReactNode
}) {
  return (
    <div className="flex items-center gap-3 px-6 mt-6 mb-2">
      <span className="text-xs font-mono text-app-accent tracking-widest uppercase shrink-0">
        {name}
      </span>
      <div className="flex-1 h-px bg-app-border" />
      {children}
      {count !== undefined && (
        <span className="text-xs font-mono text-app-muted tabular-nums shrink-0">{count}</span>
      )}
    </div>
  )
}
