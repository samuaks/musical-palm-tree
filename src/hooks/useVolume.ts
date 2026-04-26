import { useState, useEffect, useRef } from 'react'

const STORAGE_KEY = 'playmusic-volume'

export function useVolume() {
  const [volume, setVolume] = useState(() => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY)
        return saved ? Number(saved) : 1
    } catch {
        return 1
    }
  })

  const prevVolume = useRef(volume)

  useEffect(() => {
        localStorage.setItem(STORAGE_KEY, String(volume))
  }, [volume])

  function changeVolume(v: number) {
    if (v > 0) prevVolume.current = v
    setVolume(v)
  }

  function toggleMute() {
    if (volume === 0) {
        changeVolume(prevVolume.current)
    } else {
        prevVolume.current = volume
        changeVolume(0)
    }
  }

  return { volume, changeVolume, toggleMute }
}