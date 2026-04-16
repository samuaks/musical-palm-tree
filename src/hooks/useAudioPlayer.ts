import {  useState, useEffect } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { MediaFile } from '../types'

export function useAudioPlayer(
  track: MediaFile | null,
  mediaRef: React.RefObject<HTMLVideoElement | HTMLAudioElement>,
  onEnded?: () => void
) {
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [volume, setVolume] = useState(1)

  useEffect(() => {
    if (!track) return
    const media = mediaRef.current
    if (!media) return
    media.src = convertFileSrc(track.path)
    media.play()
    setPlaying(true)
    setCurrentTime(0)
    setDuration(0)
  }, [track])

  useEffect(() => {
    const media = mediaRef.current
    if (!media) return

    function handleMetadata() { setDuration(media.duration) }
    function handleTimeUpdate() { setCurrentTime(media.currentTime) }
    function handleEnded() { setPlaying(false); onEnded?.() }

    media.addEventListener('loadedmetadata', handleMetadata)
    media.addEventListener('timeupdate', handleTimeUpdate)
    media.addEventListener('ended', handleEnded)

    return () => {
      media.removeEventListener('loadedmetadata', handleMetadata)
      media.removeEventListener('timeupdate', handleTimeUpdate)
      media.removeEventListener('ended', handleEnded)
    }
  }, [onEnded])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [playing])
   useEffect(() => {
    function handleSeek(e: KeyboardEvent) {
      if (e.code === 'ArrowRight' && e.target === document.body) {
        e.preventDefault()
        seek(Math.min(duration, currentTime + 5))
      }
      if (e.code === 'ArrowLeft' && e.target === document.body) {
        e.preventDefault()
        seek(Math.max(0, currentTime - 5))
      }
    }
    window.addEventListener('keydown', handleSeek)
    return () => window.removeEventListener('keydown', handleSeek)
  }, [currentTime, duration])

  useEffect(() => {
    function handleVolumeChange(e: KeyboardEvent) {
      if (e.code === 'ArrowUp' && e.target === document.body) {
        e.preventDefault()
        changeVolume(Math.min(1, volume + 0.1))
      }
      if (e.code === 'ArrowDown' && e.target === document.body) {
        e.preventDefault()
        changeVolume(Math.max(0, volume - 0.1))
      }
    }
    window.addEventListener('keydown', handleVolumeChange)
    return () => window.removeEventListener('keydown', handleVolumeChange)
  }, [volume])

  function toggle() {
    const media = mediaRef.current
    if (!media) return
    if (playing) { media.pause() } else { media.play() }
    setPlaying(!playing)
  }

  function seek(time: number) {
    const media = mediaRef.current
    if (!media) return
    media.currentTime = time
    setCurrentTime(time)
  }

  function changeVolume(v: number) {
    const media = mediaRef.current
    if (!media) return
    media.volume = v
    setVolume(v)
  }

  return { playing, duration, currentTime, toggle, seek, volume, changeVolume }
}