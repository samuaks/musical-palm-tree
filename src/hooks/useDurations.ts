import { useEffect, useRef } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useAppStore } from '../store'

function getDuration(path: string): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio()
    audio.src = convertFileSrc(path)
    audio.onloadedmetadata = () => {
      resolve(audio.duration || 0)
      audio.src = ''
    }
    audio.onerror = () => {
      resolve(0)
    }
  })
}

const CONCURRENT_LIMIT = 6

export function useDurations() {
  const queue = useRef<string[]>([])
  const inFlight = useRef(0)

  const dirs = useAppStore((s) => s.dirs)
  const setDuration = useAppStore((s) => s.setDuration)

  useEffect(() => {
    const allFiles = dirs.flatMap((d) => [
      ...d.files.map((f) => f.path),
      ...d.albums.flatMap((a) => a.files.map((f) => f.path)),
    ])
    const existing = useAppStore.getState().durations
    queue.current = allFiles.filter((path) => !(path in existing))
    pump()
  }, [dirs])

  function pump() {
    while (inFlight.current < CONCURRENT_LIMIT && queue.current.length > 0) {
      const path = queue.current.shift()!
      inFlight.current++
      getDuration(path).then((duration) => {
        setDuration(path, duration)
        inFlight.current--
        pump()
      })
    }
  }
}
