import { useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

export function useWaveform() {
  const [waveformData, setWaveformData] = useState<number[]>([])
  const [loading, setLoading] = useState(false)
  // Only the latest request may update state: with quick track changes, an older
  // waveform can arrive after a newer one.
  const latest = useRef(0)

  async function generateWaveform(path: string | null): Promise<void> {
    const request = ++latest.current
    setWaveformData([])
    if (!path) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const result = await invoke<{ samples: number[] }>('generate_waveform', { path })
      if (request !== latest.current) return

      const data = result.samples
      const max = Math.max(...data)
      const min = Math.min(...data)
      const range = max - min || 1

      const normalized = data.map((v) => (v - min) / range).map((v) => Math.pow(v, 1.3))

      setWaveformData(normalized)
    } catch (e) {
      // e.g. an unsupported codec: the player keeps showing the plain progress line
      if (request === latest.current) console.error('waveform error:', e)
    } finally {
      if (request === latest.current) setLoading(false)
    }
  }

  return { waveformData, generateWaveform, loading }
}
