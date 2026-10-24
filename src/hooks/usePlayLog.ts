import { useEffect, useRef } from 'react'
import { selectCurrentTrack, streamKey, useAppStore } from '../store'
import { trackToOnlinePlay } from '../api/online'
import { Track } from '../types'

/** How long a track has to play before it counts as played. */
const PLAYED_AFTER_SECS = 30

/**
 * Adds the current track (library file or online) to the play log (`plays`) once it has played
 * for 30 s (half of a shorter track), so quick skips and misclicks don't count. Time spent
 * paused, resolving the stream, or after the stream failed doesn't count.
 */
export function usePlayLog() {
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
  const played = useRef<{ track: Track | null; ms: number; recorded: boolean }>({
    track: null,
    ms: 0,
    recorded: false,
  })

  useEffect(() => {
    if (played.current.track !== track) played.current = { track, ms: 0, recorded: false }
    const state = played.current
    if (!track || !playing || resolving || failed || state.recorded) return

    // a library file's length comes from the lazily filled durations
    const length =
      track.source === 'local'
        ? (useAppStore.getState().library.durations[track.path] ?? track.duration_secs)
        : track.duration_secs
    const needed = length > 0 ? Math.min(PLAYED_AFTER_SECS, length / 2) : PLAYED_AFTER_SECS
    const startedAt = Date.now()
    const timer = setTimeout(
      () => {
        state.recorded = true
        useAppStore
          .getState()
          .recordPlay(
            track.source === 'local'
              ? { source: 'local', path: track.path, name: track.name }
              : trackToOnlinePlay(track)
          )
      },
      Math.max(0, needed * 1000 - state.ms)
    )
    return () => {
      clearTimeout(timer)
      state.ms += Date.now() - startedAt
    }
  }, [track, playing, resolving, failed])
}
