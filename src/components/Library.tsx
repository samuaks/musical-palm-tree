import { ChevronDown, ChevronRight } from 'lucide-react'
import { useCollapsed } from '../hooks/useCollapsed'
import { AlbumSkeleton } from './Skeleton'
import { TrackList } from './TrackList'
import { useAppStore } from '../store'
import { useMemo } from 'react'
import { filterDirs } from '../utils/filterDirs'

export function Library() {
  const dirs = useAppStore((s) => s.dirs)
  const query = useAppStore((s) => s.query)
  const scanState = useAppStore((s) => s.scanState)

  const filtered = useMemo(() => filterDirs(dirs, query), [dirs, query])

  const { isCollapsed, toggle } = useCollapsed()

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
        <div className="px-4 py-1 text-xs text-slate-600 font-mono animate-pulse">scanning...</div>
      )}

      {filtered.length === 0 && scanState === 'done' && (
        <div className="px-4 py-3 text-xs text-slate-600 font-mono">
          {query ? 'no results.' : 'no media found.'}
        </div>
      )}

      {filtered.map((dir) => (
        <div key={dir.path} className="mb-2">
          <SectionHeader
            name={dir.name}
            count={dir.files.length + dir.albums.reduce((sum, a) => sum + a.files.length, 0)}
          />

          <TrackList files={dir.files} />

          {dir.albums.map((album) => {
            const key = `${dir.name}/${album.name}`
            const collapsed = isCollapsed(key)

            return (
              <div key={album.name}>
                <div
                  onClick={() => toggle(key)}
                  className="flex items-center gap-3 px-6 mt-3 cursor-pointer hover:bg-app-hover transition-colors py-1"
                >
                  <div className="text-app-muted">
                    {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  </div>
                  <span className="text-xs font-mono text-app-secondary tracking-wide shrink-0">
                    {album.name}
                  </span>
                  <div className="flex-1 h-px bg-app-border" />
                  <span className="text-xs font-mono text-app-muted tabular-nums shrink-0">
                    {album.files.length}
                  </span>
                </div>

                {!collapsed && <TrackList files={album.files} />}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function SectionHeader({ name, count }: { name: string; count: number }) {
  return (
    <div className="flex items-center gap-3 px-6 mt-6 mb-2">
      <span className="text-xs font-mono text-app-accent tracking-widest uppercase shrink-0">
        {name}
      </span>
      <div className="flex-1 h-px bg-app-border" />
      <span className="text-xs font-mono text-app-muted tabular-nums shrink-0">{count}</span>
    </div>
  )
}
