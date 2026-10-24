import { RefObject, useEffect, useState } from 'react'
import { coverArt } from '../api/local'
import { Track } from '../types'

// ~10–25 KB per 256 px JPEG data URL
const MAX_CACHED = 400
// path -> cover (null when the track has none), least recently used first
const cache = new Map<string, string | null>()
// lookups in progress, so two rows showing the same file share one `cover_art` call
const inflight = new Map<string, Promise<string | null>>()

function remember(path: string, src: string | null) {
  cache.delete(path)
  cache.set(path, src)
  if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value!)
}

/**
 * A local file's cover (embedded or folder art, thumbnailed and cached in Rust), or null when it
 * has none. A failed lookup isn't cached, so it's tried again next time.
 */
export function loadCover(path: string): Promise<string | null> {
  const cached = cache.get(path)
  if (cached !== undefined) return Promise.resolve(cached)
  let lookup = inflight.get(path)
  if (!lookup) {
    lookup = coverArt(path)
      .then((src) => {
        remember(path, src)
        return src
      })
      .finally(() => inflight.delete(path))
    inflight.set(path, lookup)
  }
  return lookup
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
    let cancelled = false
    loadCover(localPath)
      .then((src) => !cancelled && setLoaded({ path: localPath, src }))
      .catch(() => !cancelled && setLoaded({ path: localPath, src: null }))
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

/** id of MainView's scrolling list. */
export const SCROLL_ROOT_ID = 'main-scroll'

// One observer for all rows; each row registers what to do once it's near the viewport.
const pending = new Map<Element, () => void>()
let observer: IntersectionObserver | null = null

function whenNearViewport(el: Element, load: () => void): () => void {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        observer?.unobserve(entry.target)
        pending.get(entry.target)?.()
        pending.delete(entry.target)
      }
    },
    // The list scrolls inside MainView, which clips rows, so measure against that container:
    // against the viewport, the margin could never see rows below the fold.
    { root: document.getElementById(SCROLL_ROOT_ID), rootMargin: '400px 0px' }
  )
  pending.set(el, load)
  observer.observe(el)
  return () => {
    pending.delete(el)
    observer?.unobserve(el)
  }
}

/**
 * Cover for a library row: looked up only once the row is near the viewport, so a big library
 * doesn't ask Rust for every file's art at startup. `null` (an online item): no cover here.
 */
export function useRowCover(path: string | null, ref: RefObject<Element | null>): string | null {
  const [loaded, setLoaded] = useState<{ path: string; src: string | null } | null>(null)

  useEffect(() => {
    if (path === null) return
    // Keep a cached cover in state too, so the row still has it if the cache later evicts it.
    const cached = cache.get(path)
    if (cached !== undefined) {
      setLoaded({ path, src: cached })
      return
    }
    const el = ref.current
    if (!el) return
    let cancelled = false
    const stop = whenNearViewport(el, () => {
      loadCover(path)
        .then((src) => !cancelled && setLoaded({ path, src }))
        .catch(() => {})
    })
    return () => {
      cancelled = true
      stop()
    }
  }, [path])

  if (path === null) return null
  const cached = cache.get(path)
  if (cached !== undefined) return cached
  return loaded?.path === path ? loaded.src : null
}
