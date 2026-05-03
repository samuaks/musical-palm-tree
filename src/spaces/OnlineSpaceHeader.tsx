import { useEffect, useRef } from 'react'
import { Search } from 'lucide-react'
import { useAppStore } from '../store'
import { searchOnline } from '../api/online'

const DEBOUNCE_MS = 400

export function OnlineSpaceHeader() {
  const query = useAppStore((s) => s.spaces.online.query)
  const searchState = useAppStore((s) => s.spaces.online.searchState)
  const setQuery = useAppStore((s) => s.setOnlineQuery)
  const setResults = useAppStore((s) => s.setOnlineResults)
  const setSearchState = useAppStore((s) => s.setOnlineSearchState)
  const setSearchError = useAppStore((s) => s.setOnlineSearchError)

  const searchSeq = useRef(0)

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      setSearchState('idle')
      setSearchError(null)
      return
    }

    const seq = ++searchSeq.current
    const timer = setTimeout(async () => {
      setSearchState('searching')
      setSearchError(null)
      try {
        const res = await searchOnline(trimmed)
        if (seq !== searchSeq.current) return
        setResults(res)
        setSearchState('done')
      } catch (e) {
        if (seq !== searchSeq.current) return
        setSearchError(typeof e === 'string' ? e : String(e))
        setSearchState('error')
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query, setResults, setSearchState, setSearchError])

  return (
    <div className="flex flex-col gap-4">
      {/* status row — mirrors LocalSpaceHeader's stats row for layout parity */}
      <div className="flex items-center gap-4 min-h-5">
        {searchState === 'searching' && (
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-app-accent animate-pulse" />
            <span className="text-xs text-app-muted font-mono">searching...</span>
          </div>
        )}
      </div>

      {/* search row — identical styling to local for visual consistency */}
      <div className="flex items-center gap-3 px-3 py-2 rounded border border-app-border hover:border-app-accent-dim transition-colors focus-within:border-app-accent">
        <Search size={16} className="text-app-muted shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search youtube..."
          className="bg-transparent text-app-text text-sm font-mono placeholder-app-muted outline-none flex-1"
        />
      </div>
    </div>
  )
}
