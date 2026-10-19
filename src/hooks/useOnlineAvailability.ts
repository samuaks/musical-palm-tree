import { useEffect } from 'react'
import { onlineAvailable } from '../api/online'
import { useAppStore } from '../store'

/** Checks once at startup whether yt-dlp is installed; without it the Online space is hidden. */
export function useOnlineAvailability() {
  useEffect(() => {
    const { setOnlineAvailable } = useAppStore.getState()
    onlineAvailable()
      .then(setOnlineAvailable)
      .catch(() => setOnlineAvailable(false))
  }, [])
}
