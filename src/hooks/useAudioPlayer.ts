import { useState, useEffect, useRef } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useVolume } from './useVolume'
import { isVideo } from '../constants'
import { useAppStore } from '../store'

export function useAudioPlayer(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  onEnded?: () => void
) {
  const track = useAppStore((s) => s.currentTrack)
  const setStorePlaying = useAppStore((s) => s.setPlaying)

  const audioRef = useRef<HTMLAudioElement>(new Audio())
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [convertedSrc, setConvertedSrc] = useState<string>('')

  const { volume, changeVolume, toggleMute } = useVolume()

  //useAudioNormalization(audioRef)

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

    // pause both elements before switching
    audioRef.current.pause()
    if (videoRef.current) videoRef.current.pause()

    const src = convertFileSrc(track.path)
    setConvertedSrc(src)
    const media = getMedia()
    media.src = src
    media.load()
    setCurrentTime(0)
    setDuration(0)
    setPlaying(false)

    const playPromise = media.play()
    if (playPromise) {
      playPromise
        .then(() => setPlaying(true))
        .catch((e) => {
          if (e.name !== 'AbortError') console.error(e)
        })
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
