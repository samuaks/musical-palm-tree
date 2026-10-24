import { useEffect, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'
import { CurrentPage } from './pages/Pages'
import { ScrollToActive } from './ScrollToActivate'
import { useScan } from '../hooks/useScan'
import { useDurations } from '../hooks/useDurations'
import { usePlayLog } from '../hooks/usePlayLog'
import { useTwitchLiveStatus } from '../hooks/useTwitchChannels'
import { SCROLL_ROOT_ID } from '../hooks/useCoverArt'
import { useAppStore } from '../store'
import { downloadKey } from '../api/online'
import { DownloadProgress } from '../types'

/**
 * The content area: the page picked in the sidebar (`nav.view`), or search results while the
 * search box has text. Also runs the app-wide data hooks (scan, durations, downloads, history).
 */
export function MainView() {
  useScan()
  useDurations()
  useDownloadProgress()
  usePlayLog()
  useTwitchLiveStatus()

  // One scroll element for every page (the lazy-cover observer is rooted on it), back to the
  // top when the page or search changes
  const scrollRef = useRef<HTMLDivElement>(null)
  const view = useAppStore((s) => s.nav.view)
  const searching = useAppStore((s) => s.query.trim() !== '')
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [view, searching])

  return (
    <div className="flex-1 min-w-0 relative overflow-hidden">
      <ScrollToActive />
      <div ref={scrollRef} id={SCROLL_ROOT_ID} className="overflow-y-auto h-full pb-4">
        <CurrentPage />
      </div>
    </div>
  )
}

/** Download percentages, kept here so they're tracked even while the results aren't shown. */
function useDownloadProgress() {
  useEffect(() => {
    const { setDownloadPercent } = useAppStore.getState()
    const unlisten = listen<DownloadProgress>('download_progress', ({ payload }) => {
      const percent = payload.total ? Math.round((payload.downloaded / payload.total) * 100) : null
      setDownloadPercent(downloadKey(payload.platform, payload.video_id, payload.kind), percent)
    })
    return () => {
      unlisten.then((stop) => stop())
    }
  }, [])
}
