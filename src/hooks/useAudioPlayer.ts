import { useState, useEffect, useRef } from 'react'
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
  const [convertedSrc, setConvertedSrc] = useState<string>('')

  useEffect(() => {
  if (!track) return
  const src = convertFileSrc(track.path)
  setConvertedSrc(src)
  const audio = audioRef.current
  audio.pause()        
  audio.src = src
  audio.load()         
  setCurrentTime(0)
  setDuration(0)

  const playPromise = audio.play()
  if (playPromise) {
    playPromise
      .then(() => setPlaying(true))
      .catch(e => {
        if (e.name !== 'AbortError') console.error(e)
      })
  }
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
      if (e.target !== document.body) return
      e.preventDefault()
      if (e.code === 'Space') toggle()
      if (e.code === 'ArrowRight') seek(Math.min(duration, currentTime + 5))
      if (e.code === 'ArrowLeft') seek(Math.max(0, currentTime - 5))
      if (e.code === 'ArrowUp') changeVolume(Math.min(1, volume + 0.1))
      if (e.code === 'ArrowDown') changeVolume(Math.max(0, volume - 0.1))
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [playing, currentTime, duration, volume])

  function toggle() {
    const audio = audioRef.current
    if (playing) { audio.pause() } else { audio.play() }
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

  return { playing, duration, currentTime, toggle, seek, volume, changeVolume, convertedSrc }
}