import { useEffect, useState, useRef } from 'react'
import { Music } from 'lucide-react'
import { useAppStore } from '../store'

export function ScrollToActive() {
  const currentTrack = useAppStore((s) => s.currentTrack)
  const dirs = useAppStore((s) => s.dirs)
  const collapsed = useAppStore((s) => s.collapsed)
  const toggleCollapsed = useAppStore((s) => s.toggleCollapsed)

  const [offscreen, setOffscreen] = useState(false)
  const observer = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    if (!currentTrack) {
      setOffscreen(false)
      return
    }

    function findAndObserve() {
      if (!currentTrack) return
      const el = document.querySelector(`[data-track-path="${CSS.escape(currentTrack.path)}"]`)

      if (!el) {
        // track is in a collapsed album — show button so user can navigate to it
        setOffscreen(true)
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
  }, [currentTrack, collapsed])

  function scrollToActive() {
    if (!currentTrack) return

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
