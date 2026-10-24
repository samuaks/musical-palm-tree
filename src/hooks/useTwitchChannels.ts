import { useEffect, useMemo } from 'react'
import { useAppStore } from '../store'
import { twitchLiveStatus } from '../api/online'
import { TwitchChannel, twitchChannels } from '../utils/plays'
import { OnlineSearchResult } from '../types'

/** How many channels the sidebar lists (and checks). */
const CHANNELS = 10
/** How often the live dots are refreshed. */
const LIVE_CHECK_EVERY_MS = 5 * 60 * 1000

/**
 * The Twitch channels from the play log, most recently played first (the sidebar's 10), without
 * the ones you hid.
 */
export function useTwitchChannels(limit = CHANNELS): TwitchChannel[] {
  const plays = useAppStore((s) => s.plays)
  const hidden = useAppStore((s) => s.online.hiddenChannels)
  return useMemo(
    () => twitchChannels(plays, limit, (name) => !hidden.has(name)),
    [plays, limit, hidden]
  )
}

/** The channels you hid, to bring them back (Explore). */
export function useHiddenChannels(): TwitchChannel[] {
  const plays = useAppStore((s) => s.plays)
  const hidden = useAppStore((s) => s.online.hiddenChannels)
  return useMemo(() => {
    const known = twitchChannels(plays, Infinity, (name) => hidden.has(name))
    // a hidden channel whose plays have left the log is still listed, by its login
    const missing = [...hidden].filter((name) => !known.some((c) => c.name === name))
    return [...known, ...missing.map((name) => ({ name, display: name }))]
  }, [plays, hidden])
}

/**
 * Keeps `online.liveStreams` up to date for the sidebar's channels: checked at startup, every
 * 5 minutes, when the set of channels changes (not when they're only reordered), and on
 * `checkLiveNow` (Home's refresh).
 */
export function useTwitchLiveStatus() {
  const channels = useTwitchChannels()
  const ready = useAppStore((s) => s.ytDlp?.available === true)
  const requested = useAppStore((s) => s.online.liveCheck)
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
        .then((streams) => {
          if (cancelled) return
          const live: [string, OnlineSearchResult][] = []
          names.forEach((name, i) => {
            const stream = streams[i]
            if (stream) live.push([name, stream])
          })
          useAppStore.getState().setLiveStreams(live)
        })
        .catch((e) => console.error('live check failed:', e))
    }
    check()
    const timer = setInterval(check, LIVE_CHECK_EVERY_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [ready, key, requested])
}
