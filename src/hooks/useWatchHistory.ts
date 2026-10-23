import { useEffect, useRef } from 'react'
import { selectCurrentTrack, streamKey, useAppStore } from '../store'
import { trackToHistory } from '../api/online'
import { Track } from '../types'

/** How long an online track has to play before it counts as watched. */
const WATCHED_AFTER_SECS = 30

/**
 * Adds the current online track to `online.history` once it has played for 30 s (half of a
 * shorter video), so quick skips and misclicks don't fill the history. Time spent paused,
 * resolving the stream, or after the stream failed doesn't count.
 */
export function useWatchHistory() {
  const track = useAppStore(selectCurrentTrack)
  const playing = useAppStore((s) => s.playing)
  const resolving = useAppStore((s) => s.resolving)
  // `playing` can stay true from the previous track when this one's stream never loads (an
  // offline channel), so a failed stream doesn't count either
  const failed = useAppStore(
    (s) =>
      track?.source === 'online' &&
      s.online.failedStreams.has(streamKey(track.platform, track.videoId))
  )
  const watched = useRef<{ track: Track | null; ms: number; recorded: boolean }>({
    track: null,
    ms: 0,
    recorded: false,
  })

  useEffect(() => {
    if (watched.current.track !== track) watched.current = { track, ms: 0, recorded: false }
    const state = watched.current
    if (track?.source !== 'online' || !playing || resolving || failed || state.recorded) return

    const needed =
      track.duration_secs > 0
        ? Math.min(WATCHED_AFTER_SECS, track.duration_secs / 2)
        : WATCHED_AFTER_SECS
    const startedAt = Date.now()
    const timer = setTimeout(
      () => {
        state.recorded = true
        useAppStore.getState().addToHistory(trackToHistory(track))
      },
      Math.max(0, needed * 1000 - state.ms)
    )
    return () => {
      clearTimeout(timer)
      state.ms += Date.now() - startedAt
    }
  }, [track, playing, resolving, failed])
}
