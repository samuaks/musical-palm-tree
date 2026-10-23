import Fuse from 'fuse.js'
import { HistoryEntry } from '../types'

/** History entries matching the search box, fuzzy like `filterDirs`, kept most recent first. */
export function filterHistory(history: HistoryEntry[], query: string): HistoryEntry[] {
  if (!query) return history
  const fuse = new Fuse(history, {
    keys: [
      { name: 'title', weight: 2 },
      { name: 'uploader', weight: 1 },
    ],
    threshold: 0.4,
    ignoreLocation: true,
    minMatchCharLength: 2,
  })
  const matches = new Set(fuse.search(query).map((r) => r.item))
  return history.filter((e) => matches.has(e))
}
