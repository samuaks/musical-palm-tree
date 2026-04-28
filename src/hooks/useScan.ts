import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { Directory, ScanResult } from '../types'
import { useAppStore } from '../store'

export function useScan() {
  const hasScanned = useRef(false)

  useEffect(() => {
    if (hasScanned.current) return
    hasScanned.current = true

    const { setDirs, setScanMeta, setScanState, setLiveCount } = useAppStore.getState()

    setScanState('scanning')

    let unlistenProgress: (() => void) | undefined
    let unlistenCount: (() => void) | undefined

    async function setup() {
      unlistenProgress = await listen<Directory[]>('scan_progress', event => {
        setDirs(event.payload)
      })

      unlistenCount = await listen<number>('scan_count', event => {
        setLiveCount(event.payload)
      })

      const r = await invoke<ScanResult>('scan_media')
      setDirs(r.directories)
      setScanMeta(r.metadata)
      setScanState('done')
    }

    setup()

    return () => {
      unlistenProgress?.()
      unlistenCount?.()
    }
  }, [])
}