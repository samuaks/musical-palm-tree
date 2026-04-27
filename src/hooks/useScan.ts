import { useEffect, useRef, useState } from 'react'
import { ScanMetaData, Directory, ScanState, ScanResult } from '../types'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'

export function useScan() {
  const [scanMeta, setScanMeta] = useState<ScanMetaData | null>(null)
  const [dirs, setDirs] = useState<Directory[]>([])
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [liveCount, setLiveCount] = useState<number>(0)

  const hasScanned = useRef(false)

  useEffect(() => {
    if (hasScanned.current) return
    hasScanned.current = true
    setScanState('scanning')

    let unlistenProgress: () => void
    let unlistenCount: () => void

    async function setupListeners() {
      unlistenProgress = await listen<Directory[]>('scan_progress', (event) => {
        setDirs(event.payload)
      })
      unlistenCount = await listen<number>('scan_count', (event) => {
        setLiveCount(event.payload)
      })

      const invokeResult = await invoke<ScanResult>('scan_media')
      setScanMeta(invokeResult.metadata)
      setDirs(invokeResult.directories)
      setScanState('done')
    }
    setupListeners()

    return () => {
      unlistenProgress?.()
      unlistenCount?.()
    }
  }, [])
  return { scanMeta, dirs, scanState, liveCount }
}
