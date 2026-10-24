import { useEffect, useState, useRef } from 'react'
import { Music } from 'lucide-react'
import { selectCurrentTrack, useAppStore } from '../store'

export function ScrollToActive() {
  const currentTrack = useAppStore(selectCurrentTrack)
  const dirs = useAppStore((s) => s.library.dirs)
  const collapsed = useAppStore((s) => s.library.collapsed)
  const toggleCollapsed = useAppStore((s) => s.toggleLibraryCollapsed)
  const searching = useAppStore((s) => s.query.trim() !== '')
  const view = useAppStore((s) => s.nav.view)

  const [offscreen, setOffscreen] = useState(false)
  const observer = useRef<IntersectionObserver | null>(null)

  // Re-run on every page change too: the rows under the one scroll element are swapped
  useEffect(() => {
    setOffscreen(false)
    if (!currentTrack) return

    function findAndObserve() {
      if (!currentTrack) return
      const el = document.querySelector(`[data-track-path="${CSS.escape(currentTrack.path)}"]`)

      if (!el) {
        // A local track that this page lists but that isn't in the DOM is in a collapsed
        // album: show the button so the user can open it. A track filtered out by the search,
        // on another page, or an online item that isn't listed, has nowhere to scroll to.
        const dir = useAppStore
          .getState()
          .library.dirs.find(
            (d) =>
              d.files.some((f) => f.path === currentTrack.path) ||
              d.albums.some((a) => a.files.some((f) => f.path === currentTrack.path))
          )
        const pageLists =
          view.page === 'library' || (view.page === 'folder' && dir?.path === view.path)
        setOffscreen(currentTrack.source === 'local' && !searching && !!dir && pageLists)
        return
      }

      observer.current?.disconnect()
      observer.current = new IntersectionObserver(
        ([entry]) => setOffscreen(!entry.isIntersecting),
        { threshold: 0.5 }
      )
      observer.current.observe(el)
    }

    const timeout = setTimeout(findAndObserve, 100)

    return () => {
      clearTimeout(timeout)
      observer.current?.disconnect()
    }
  }, [currentTrack, collapsed, searching, view])

  function scrollToActive() {
    if (!currentTrack) return
    if (currentTrack.source === 'online') {
      scrollNow() // a YouTube result row, never inside an album
      return
    }

    // find which dir/album contains the active track
    for (const dir of dirs) {
      // direct file in dir
      if (dir.files.some((f) => f.path === currentTrack.path)) {
        // no album to expand, just scroll
        scrollNow()
        return
      }
      // file inside an album
      const album = dir.albums.find((a) => a.files.some((f) => f.path === currentTrack.path))
      if (album) {
        const key = `${dir.name}/${album.name}`
        if (collapsed.has(key)) {
          toggleCollapsed(key)
          // wait for DOM to render the expanded album
          setTimeout(scrollNow, 100)
        } else {
          scrollNow()
        }
        return
      }
    }
  }

  function scrollNow() {
    if (!currentTrack) return
    const el = document.querySelector(`[data-track-path="${CSS.escape(currentTrack.path)}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  if (!offscreen || !currentTrack) return null

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30">
      <button
        onClick={scrollToActive}
        className="flex items-center gap-2 px-3 py-2 rounded-full bg-app-accent 
        text-app-accent-text text-xs font-mono hover:scale-105 transition-transform shadow-lg"
        title="Jump to current track"
      >
        <Music size={12} />
        <span className="truncate max-w-50">{currentTrack.name.replace(/\.[^/.]+$/, '')}</span>
      </button>
    </div>
  )
}
