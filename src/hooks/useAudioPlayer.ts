import { useState, useEffect, useRef } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useVolume } from './useVolume'
import { isVideo } from '../constants'
import { useAppStore, selectCurrentTrack } from '../store'
import { resolveStream } from '../api/online'

const RETRY_COOLDOWN_MS = 10_000

export function useAudioPlayer(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  onEnded?: () => void
) {
  const track = useAppStore(selectCurrentTrack)
  const setStorePlaying = useAppStore((s) => s.setPlaying)
  const setResolving = useAppStore((s) => s.setResolving)

  const audioRef = useRef<HTMLAudioElement>(new Audio())
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [convertedSrc, setConvertedSrc] = useState<string>('')

  const lastRetryAt = useRef<number>(0)

  const { volume, changeVolume, toggleMute } = useVolume()

  const trackIsVideo = track ? isVideo(track.ext) : false

  function getMedia(): HTMLAudioElement | HTMLVideoElement {
    if (trackIsVideo && videoRef.current) return videoRef.current
    return audioRef.current
  }

  useEffect(() => {
    setStorePlaying(playing)
  }, [playing])

  useEffect(() => {
    if (!track) return

    audioRef.current.pause()
    if (videoRef.current) videoRef.current.pause()

    setCurrentTime(0)
    setDuration(0)
    setPlaying(false)
    setResolving(false)
    lastRetryAt.current = 0 // reset cooldown when track changes

    let cancelled = false

    ;(async () => {
      let src: string
      if (track.source === 'local') {
        src = convertFileSrc(track.path)
      } else {
        setResolving(true)
        try {
          src = await resolveStream(track.videoId)
        } catch (e) {
          console.error('failed to resolve stream:', e)
          if (!cancelled) setResolving(false)
          return
        }
        if (cancelled) return
        setResolving(false)
      }

      if (cancelled) return

      setConvertedSrc(src)
      const media = getMedia()
      media.src = src
      media.load()

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
  }, [track])

  // retry on stream URL expiry for online tracks
  useEffect(() => {
    if (!track || track.source !== 'online') return
    const videoId = track.videoId
    const media = getMedia()

    let cancelled = false

    async function handleError() {
      const now = Date.now()
      if (now - lastRetryAt.current < RETRY_COOLDOWN_MS) return
      lastRetryAt.current = now

      const resumeAt = media.currentTime
      const wasPlaying = !media.paused

      setResolving(true)

      try {
        const fresh = await resolveStream(videoId)
        if (cancelled) return // track changed during retry — abort
        setConvertedSrc(fresh)
        media.src = fresh
        media.load()
        media.currentTime = resumeAt
        if (wasPlaying) {
          await media.play().catch((e) => {
            if (e.name !== 'AbortError') console.error('play after retry failed:', e)
          })
        }
      } catch (e) {
        if (!cancelled) console.error('retry resolve failed:', e)
      } finally {
        if (!cancelled) setResolving(false)
      }
    }

    media.addEventListener('error', handleError)
    return () => {
      cancelled = true
      media.removeEventListener('error', handleError)
    }
  }, [track])

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
      if (e.code === 'KeyF' && trackIsVideo && videoRef.current) {
        if (document.fullscreenElement) document.exitFullscreen()
        else videoRef.current.requestFullscreen()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [playing, currentTime, duration, volume])

  function toggle() {
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
