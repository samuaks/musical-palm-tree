import { useEffect, useState } from 'react'
import { coverArt } from '../api/local'
import { Track } from '../types'

const MAX_CACHED = 200
// path -> cover (null when the track has none), least recently used first
const cache = new Map<string, string | null>()

function remember(path: string, src: string | null) {
  cache.delete(path)
  cache.set(path, src)
  if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!)
}

/**
 * Image src for the track's cover: the YouTube thumbnail for online tracks, embedded or
 * folder art (looked up in Rust) for local ones. Null while loading or when there's none,
 * never the previous track's cover.
 */
export function useCoverArt(track: Track | null): string | null {
  const localPath = track?.source === 'local' ? track.path : null
  const [loaded, setLoaded] = useState<{ path: string; src: string | null } | null>(null)

  useEffect(() => {
    if (!localPath) return
    // Set state even on a cache hit: the result may have landed after this render read the
    // cache, and without a state change nothing would re-render to show it.
    const cached = cache.get(localPath)
    if (cached !== undefined) {
      setLoaded({ path: localPath, src: cached })
      return
    }
    let cancelled = false
    coverArt(localPath)
      .then((src) => {
        remember(localPath, src)
        if (!cancelled) setLoaded({ path: localPath, src })
      })
      .catch(() => {
        // Not cached: a failed lookup is retried next time the track is played.
        if (!cancelled) setLoaded({ path: localPath, src: null })
      })
    return () => {
      cancelled = true
    }
  }, [localPath])

  if (!track) return null
  if (track.source === 'online') return track.art_path
  const cached = cache.get(track.path)
  if (cached !== undefined) return cached
  return loaded?.path === track.path ? loaded.src : null
}
