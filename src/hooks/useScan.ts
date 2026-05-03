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

    const { setLocalDirs, setLocalScanMeta, setLocalScanState, setLocalLiveCount } =
      useAppStore.getState()

    setLocalScanState('scanning')

    let unlistenProgress: (() => void) | undefined
    let unlistenCount: (() => void) | undefined

    async function setup() {
      unlistenProgress = await listen<Directory[]>('scan_progress', (event) => {
        setLocalDirs(event.payload)
      })

      unlistenCount = await listen<number>('scan_count', (event) => {
        setLocalLiveCount(event.payload)
      })

      const r = await invoke<ScanResult>('scan_media')
      setLocalDirs(r.directories)
      setLocalScanMeta(r.metadata)
      setLocalScanState('done')
    }

    setup()

    return () => {
      unlistenProgress?.()
      unlistenCount?.()
    }
  }, [])
}
