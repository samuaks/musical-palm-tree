import { useEffect, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'
import { Directory } from '../types'
import { useAppStore } from '../store'
import { scanLibrary } from '../api/local'

export function useScan() {
  const hasScanned = useRef(false)

  useEffect(() => {
    const { setLocalDirs, setLocalLiveCount, spaces } = useAppStore.getState()

    let unlistenProgress: (() => void) | undefined
    let unlistenCount: (() => void) | undefined

    async function setup() {
      unlistenProgress = await listen<Directory[]>('scan_progress', (event) => {
        // Live snapshots fill an empty library; a rescan keeps the full one until it's done.
        if (useAppStore.getState().spaces.local.scanMeta === null) setLocalDirs(event.payload)
      })

      unlistenCount = await listen<number>('scan_count', (event) => {
        setLocalLiveCount(event.payload)
      })

      // Scan once; later scans (after downloads) come from scanLibrary() callers.
      if (hasScanned.current || spaces.local.dirs.length > 0) return
      hasScanned.current = true
      await scanLibrary()
    }

    setup()

    return () => {
      unlistenProgress?.()
      unlistenCount?.()
    }
  }, [])
}
