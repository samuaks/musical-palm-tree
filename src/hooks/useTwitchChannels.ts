import { useEffect, useMemo } from 'react'
import { useAppStore } from '../store'
import { twitchLiveStatus } from '../api/online'
import { TwitchChannel, twitchChannels } from '../utils/plays'

/** How many channels the sidebar lists (and checks). */
const CHANNELS = 10
/** How often the live dots are refreshed. */
const LIVE_CHECK_EVERY_MS = 5 * 60 * 1000

/** The Twitch channels from the play log, most recently played first (the sidebar's 10). */
export function useTwitchChannels(limit = CHANNELS): TwitchChannel[] {
  const plays = useAppStore((s) => s.plays)
  return useMemo(() => twitchChannels(plays, limit), [plays, limit])
}

/**
 * Keeps `online.liveChannels` up to date for the sidebar's channels: checked at startup, every
 * 5 minutes, and when the set of channels changes (not when they're only reordered).
 */
export function useTwitchLiveStatus() {
  const channels = useTwitchChannels()
  const ready = useAppStore((s) => s.ytDlp?.available === true)
  const key = channels
    .map((c) => c.name)
    .sort()
    .join(',')

  useEffect(() => {
    if (!ready || !key) return
    const names = key.split(',')
    let cancelled = false
    function check() {
      twitchLiveStatus(names)
        .then((live) => {
          if (!cancelled) useAppStore.getState().setLiveChannels(names.filter((_, i) => live[i]))
        })
        .catch((e) => console.error('live check failed:', e))
    }
    check()
    const timer = setInterval(check, LIVE_CHECK_EVERY_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [ready, key])
}
