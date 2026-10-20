import { useEffect } from 'react'

/** Drift (seconds) beyond which the picture is snapped back to the sound. */
export const MAX_DRIFT_S = 0.3
/** Drift (seconds) small enough to leave alone. */
export const IN_SYNC_S = 0.04
/** How much faster or slower the picture runs while it catches up. */
const CATCH_UP = 0.1

export function needsResync(videoTime: number, audioTime: number, threshold = MAX_DRIFT_S) {
  return Math.abs(videoTime - audioTime) > threshold
}

/**
 * Playback rate for the picture: the sound's rate, nudged so that a small drift closes over a
 * second or two instead of with a visible jump.
 */
export function followRate(drift: number, audioRate: number) {
  if (Math.abs(drift) <= IN_SYNC_S) return audioRate
  return audioRate * (drift > 0 ? 1 - CATCH_UP : 1 + CATCH_UP)
}

function ignoreAbort(e: unknown) {
  if (!(e instanceof DOMException && e.name === 'AbortError')) console.error(e)
}

/**
 * Keeps a muted video-only `<video>` in step with the `<audio>` that plays the sound (online
 * tracks above 360p come as separate streams). The audio is the master clock: every control
 * goes to it, and the video follows. The audio is never paused for the video, so a stalled
 * picture catches up instead of interrupting the sound.
 */
export function useVideoSync(
  audioRef: React.RefObject<HTMLAudioElement>,
  videoRef: React.RefObject<HTMLVideoElement | null>,
  active: boolean
) {
  useEffect(() => {
    const audio = audioRef.current
    const video = videoRef.current
    if (!active || !video) return

    function snap() {
      if (video && video.currentTime !== audio.currentTime) video.currentTime = audio.currentTime
    }
    function follow() {
      if (!video) return
      video.playbackRate = audio.playbackRate
      if (audio.paused) {
        video.pause()
        snap() // cheap while paused, and the frame matches exactly on resume
      } else {
        if (needsResync(video.currentTime, audio.currentTime)) snap()
        video.play().catch(ignoreAbort)
      }
    }
    function handleSeeking() {
      snap()
    }
    function handleWaiting() {
      video?.pause()
    }
    function handleTimeUpdate() {
      if (!video || audio.paused || audio.seeking || video.seeking) return
      const drift = video.currentTime - audio.currentTime
      if (needsResync(video.currentTime, audio.currentTime)) {
        snap()
        video.playbackRate = audio.playbackRate
      } else {
        video.playbackRate = followRate(drift, audio.playbackRate)
      }
      if (video.paused) video.play().catch(ignoreAbort)
    }

    // The audio may have started before this effect ran.
    follow()

    const listeners: [string, () => void][] = [
      ['play', follow],
      ['playing', follow],
      ['pause', follow],
      ['ratechange', follow],
      ['seeking', handleSeeking],
      ['waiting', handleWaiting],
      ['timeupdate', handleTimeUpdate],
    ]
    for (const [event, handler] of listeners) audio.addEventListener(event, handler)
    return () => {
      for (const [event, handler] of listeners) audio.removeEventListener(event, handler)
    }
  }, [active])
}
