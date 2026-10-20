import { useEffect } from 'react'
import { ytDlpStatus } from '../api/online'
import { useAppStore } from '../store'

/** Checks once at startup whether yt-dlp is installed (or installable) for the Online space. */
export function useOnlineAvailability() {
  useEffect(() => {
    const { setYtDlp } = useAppStore.getState()
    ytDlpStatus()
      .then(setYtDlp)
      .catch(() => setYtDlp({ available: false, can_install: false, ffmpeg: false }))
  }, [])
}
