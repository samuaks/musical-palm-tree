import { useRef, useState, useEffect } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { MediaFile } from '../types'

export function useAudioPlayer(
  track: MediaFile | null,
  onEnded?: () => void
) {
  const audioRef = useRef<HTMLAudioElement>(new Audio())
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [volume, setVolume] = useState(1)


  useEffect(() => {
    if (!track) return
    audioRef.current.src = convertFileSrc(track.path)
    audioRef.current.play()
    setPlaying(true)
    setCurrentTime(0)
    setDuration(0)
  }, [track])

  useEffect(() => {
    const audio = audioRef.current

    function handleMetadata() { setDuration(audio.duration) }
    function handleTimeUpdate() { setCurrentTime(audio.currentTime) }
    function handleEnded() { setPlaying(false); onEnded?.() }

    audio.addEventListener('loadedmetadata', handleMetadata)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('ended', handleEnded)

    return () => {
      audio.removeEventListener('loadedmetadata', handleMetadata)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('ended', handleEnded)
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
    if (playing) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setPlaying(!playing)
  }

  function seek(time: number) {
    audioRef.current.currentTime = time
    setCurrentTime(time)
  }

  function changeVolume(v: number) {
    audioRef.current.volume = v
    setVolume(v)
  }

  return { playing, duration, currentTime, toggle, seek, changeVolume, volume }
}