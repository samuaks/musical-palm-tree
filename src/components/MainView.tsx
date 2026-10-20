import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { Library } from './Library'
import { YouTubeSection } from './YouTubeSection'
import { ScrollToActive } from './ScrollToActivate'
import { useScan } from '../hooks/useScan'
import { useDurations } from '../hooks/useDurations'
import { SCROLL_ROOT_ID } from '../hooks/useCoverArt'
import { useAppStore } from '../store'
import { downloadKey } from '../api/online'
import { DownloadProgress } from '../types'

/**
 * The one content view: the library (filtered by the search box) and, while searching, the
 * YouTube results under it. Scrolls as a whole.
 */
export function MainView() {
  useScan()
  useDurations()
  useDownloadProgress()

  return (
    <div className="flex-1 relative overflow-hidden">
      <ScrollToActive />
      <div id={SCROLL_ROOT_ID} className="overflow-y-auto h-full py-2">
        <Library />
        <YouTubeSection />
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
      setDownloadPercent(downloadKey(payload.video_id, payload.kind), percent)
    })
    return () => {
      unlisten.then((stop) => stop())
    }
  }, [])
}
