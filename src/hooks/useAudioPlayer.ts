import { useState, useEffect, useRef } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useVolume } from './useVolume'
import { isVideo } from '../constants'
import { useAppStore, selectCurrentTrack } from '../store'
import { resolveStream } from '../api/online'
import { useVideoSync } from './useVideoSync'
import { attachLive } from '../utils/liveHls'

const RETRY_COOLDOWN_MS = 10_000

/** Stops an element loading or playing its stream. */
function clearSrc(media: HTMLMediaElement) {
  media.removeAttribute('src')
  media.load()
}

export function useAudioPlayer(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  onEnded?: () => void
) {
  const track = useAppStore(selectCurrentTrack)
  const setStorePlaying = useAppStore((s) => s.setPlaying)
  const setResolving = useAppStore((s) => s.setResolving)
  const setStreamFailed = useAppStore((s) => s.setStreamFailed)
  const setVideoActive = useAppStore((s) => s.setVideoActive)
  const onlineVideo = useAppStore((s) => s.online.video)

  const audioRef = useRef<HTMLAudioElement>(new Audio())
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [convertedSrc, setConvertedSrc] = useState<string>('')
  // an online track's video-only stream is playing muted in the <video>, following the <audio>
  const [syncedVideo, setSyncedVideo] = useState(false)

  const lastRetryAt = useRef<number>(0)
  const loadedTrack = useRef<typeof track>(null)
  // hls.js instances playing a live stream (stopped on every track change), and the retry for
  // when one of them fails
  const liveStops = useRef<(() => void)[]>([])
  const retryRef = useRef<(() => void) | null>(null)

  function stopLive() {
    for (const stop of liveStops.current) stop()
    liveStops.current = []
  }

  /** Points `el` at `url`: directly, or through hls.js for a live stream. */
  async function load(el: HTMLMediaElement, url: string, live: boolean) {
    if (!live) {
      el.src = url
      el.load()
      return
    }
    const stop = await attachLive(el, url, (message) => {
      console.error('live stream failed:', message)
      retryRef.current?.()
    })
    liveStops.current.push(stop)
  }

  const { volume, changeVolume, toggleMute } = useVolume()

  // Local video files play (with sound) in the <video>. Online tracks always play their sound
  // in the <audio>, which stays the element every control talks to.
  const localVideo = track?.source === 'local' && isVideo(track.ext)
  // re-resolve the current online track when video is toggled
  const wantVideo = track?.source === 'online' ? onlineVideo : null

  useVideoSync(audioRef, videoRef, syncedVideo)

  function getMedia(): HTMLAudioElement | HTMLVideoElement {
    if (localVideo && videoRef.current) return videoRef.current
    return audioRef.current
  }

  useEffect(() => {
    setStorePlaying(playing)
  }, [playing])

  useEffect(() => stopLive, [])

  useEffect(() => {
    const audio = audioRef.current
    const video = videoRef.current
    // Toggling video keeps the track going from where it was.
    const sameTrack = track !== null && track === loadedTrack.current
    const resumeAt = sameTrack ? getMedia().currentTime : 0
    const resume = sameTrack ? !getMedia().paused : true
    loadedTrack.current = track

    stopLive()
    audio.pause()
    video?.pause()
    setSyncedVideo(false)

    if (!track) {
      stopLive()
      clearSrc(audio)
      if (video) clearSrc(video)
      setConvertedSrc('')
      setCurrentTime(0)
      setDuration(0)
      setPlaying(false)
      setResolving(false)
      setVideoActive(false)
      return
    }
    lastRetryAt.current = 0 // reset cooldown when track changes

    let cancelled = false

    ;(async () => {
      let src: string
      let videoSrc: string | null = null
      let live = false
      if (track.source === 'local') {
        src = convertFileSrc(track.path)
      } else {
        setResolving(true)
        try {
          const stream = await resolveStream(track.platform, track.videoId, onlineVideo)
          src = stream.audio_url
          videoSrc = stream.video_url
          live = stream.live
          setStreamFailed(track.platform, track.videoId, false)
        } catch (e) {
          console.error('failed to resolve stream:', e)
          // e.g. a live channel from the history that's offline now
          setStreamFailed(track.platform, track.videoId, true)
          if (!cancelled) {
            setResolving(false)
            setVideoActive(false)
          }
          return
        }
        if (cancelled) return
        setResolving(false)
      }

      if (cancelled) return

      const media = localVideo && video ? video : audio
      const follower = videoSrc ? video : null
      // let go of whatever the unused element was still loading
      for (const el of [audio, video]) {
        if (el && el !== media && el !== follower) clearSrc(el)
      }
      if (video) video.muted = follower !== null
      if (follower && videoSrc) await load(follower, videoSrc, live)
      setConvertedSrc(src)
      await load(media, src, live)
      // hls.js loads asynchronously; the track may have changed meanwhile
      if (cancelled) return
      setSyncedVideo(follower !== null)
      setVideoActive(media === video || follower !== null)

      // A live stream always starts at the live edge.
      if (resumeAt > 0 && !live) media.currentTime = resumeAt
      if (!resume) return

      const playPromise = media.play()
      if (playPromise) {
        playPromise
          .then(() => {
            if (!cancelled) setPlaying(true)
          })
          .catch((e) => {
            if (e.name !== 'AbortError') console.error(e)
          })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [track, wantVideo])

  // retry on stream URL expiry for online tracks
  useEffect(() => {
    if (!track || track.source !== 'online') return
    const { platform, videoId } = track
    const audio = audioRef.current
    const video = syncedVideo ? videoRef.current : null

    let cancelled = false

    async function handleError() {
      const now = Date.now()
      if (now - lastRetryAt.current < RETRY_COOLDOWN_MS) return
      lastRetryAt.current = now

      const resumeAt = audio.currentTime
      const wasPlaying = !audio.paused

      setResolving(true)

      try {
        const fresh = await resolveStream(platform, videoId, video !== null)
        if (cancelled) return // track changed during retry — abort
        stopLive()
        setConvertedSrc(fresh.audio_url)
        if (video) {
          if (fresh.video_url) {
            await load(video, fresh.video_url, fresh.live)
            if (!fresh.live) video.currentTime = resumeAt
          } else {
            clearSrc(video)
            setSyncedVideo(false)
            setVideoActive(false)
          }
        }
        await load(audio, fresh.audio_url, fresh.live)
        if (cancelled) return
        // A live stream picks up at the live edge
        if (!fresh.live) audio.currentTime = resumeAt
        if (wasPlaying) {
          await audio.play().catch((e) => {
            if (e.name !== 'AbortError') console.error('play after retry failed:', e)
          })
        }
      } catch (e) {
        if (!cancelled) console.error('retry resolve failed:', e)
        // a live stream that ended while it played
        setStreamFailed(platform, videoId, true)
      } finally {
        if (!cancelled) setResolving(false)
      }
    }

    // hls.js (live) reports its failures through this instead of an element `error` event
    retryRef.current = handleError
    audio.addEventListener('error', handleError)
    video?.addEventListener('error', handleError)
    return () => {
      cancelled = true
      retryRef.current = null
      audio.removeEventListener('error', handleError)
      video?.removeEventListener('error', handleError)
    }
  }, [track, syncedVideo])

  useEffect(() => {
    const media = getMedia()
    media.volume = volume
  }, [volume, track])

  useEffect(() => {
    const media = getMedia()
    if (!media) return

    function handleVolumeChange() {
      changeVolume(media.volume)
    }

    function handlePlay() {
      setStorePlaying(true)
    }
    function handlePause() {
      setStorePlaying(false)
    }

    media.addEventListener('volumechange', handleVolumeChange)
    media.addEventListener('play', handlePlay)
    media.addEventListener('pause', handlePause)

    return () => {
      media.removeEventListener('volumechange', handleVolumeChange)
      media.removeEventListener('play', handlePlay)
      media.removeEventListener('pause', handlePause)
    }
  }, [track])

  useEffect(() => {
    const media = getMedia()

    function handleMetadata() {
      setDuration(media.duration)
    }
    function handleTimeUpdate() {
      setCurrentTime(media.currentTime)
    }
    function handleEnded() {
      setPlaying(false)
      onEnded?.()
    }

    media.addEventListener('loadedmetadata', handleMetadata)
    media.addEventListener('timeupdate', handleTimeUpdate)
    media.addEventListener('ended', handleEnded)

    return () => {
      media.removeEventListener('loadedmetadata', handleMetadata)
      media.removeEventListener('timeupdate', handleTimeUpdate)
      media.removeEventListener('ended', handleEnded)
    }
  }, [track, onEnded])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target !== document.body) return
      e.preventDefault()
      if (e.code === 'Space') toggle()
      if (e.code === 'ArrowRight') seek(Math.min(duration, currentTime + 5))
      if (e.code === 'ArrowLeft') seek(Math.max(0, currentTime - 5))
      if (e.code === 'ArrowUp') changeVolume(Math.min(1, volume + 0.1))
      if (e.code === 'ArrowDown') changeVolume(Math.max(0, volume - 0.1))
      if (e.code === 'KeyF' && useAppStore.getState().videoActive && videoRef.current) {
        if (document.fullscreenElement) document.exitFullscreen()
        else videoRef.current.requestFullscreen()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [playing, currentTime, duration, volume])

  function toggle() {
    if (!track) return
    const media = getMedia()
    if (playing) {
      media.pause()
    } else {
      media
        .play()
        .then(() => setPlaying(true))
        .catch((e) => {
          if (e.name !== 'AbortError') console.error(e)
        })
      return
    }
    setPlaying(!playing)
  }

  function seek(time: number) {
    // A live stream has nothing to seek to (this also covers the ←/→ keys).
    if (!track || (track.source === 'online' && track.live)) return
    const media = getMedia()
    media.currentTime = time
    setCurrentTime(time)
  }

  return {
    playing,
    duration,
    currentTime,
    toggle,
    seek,
    volume,
    changeVolume,
    toggleMute,
    convertedSrc,
  }
}
