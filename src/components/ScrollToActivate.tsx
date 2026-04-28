import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store'
import { Music } from 'lucide-react'

export function ScrollToActivate() {
  const currentTrack = useAppStore((s) => s.currentTrack)

  const [offscreen, setOffscreen] = useState(false)

  const observer = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    if (!currentTrack) {
      setOffscreen(false)
      return
    }

    const findAndObserve = () => {
      const el = document.querySelector(`[data-track-path="${CSS.escape(currentTrack.path)}"]`)
      if (!el) {
        setOffscreen(false)
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
  }, [currentTrack])

  function scrollToActive() {
    if (!currentTrack) return
    const el = document.querySelector(`[data-track-path="${CSS.escape(currentTrack.path)}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  if (!offscreen || !currentTrack) return null

  return (
    <button
      onClick={scrollToActive}
      className="fixed top-30 left-20 z-30 flex items-center gap-2 px-3 py-2 rounded-full bg-app-accent text-app-bg text-xs font-mono hover:scale-105 transition-transform shadow-lg"
      title="Jump to current track"
    >
      <Music size={12} />
      <span className="truncate max-w-50">{currentTrack.name.replace(/\.[^/.]+$/, '')}</span>
    </button>
  )
}
