import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

export function useWaveform() {
  const [waveformData, setWaveformData] = useState<number[]>([])
  const [loading, setLoading] = useState(false)

  async function generateWaveform(path: string): Promise<void> {
    setWaveformData([])
    setLoading(true)
    try {
      const result = await invoke<{ samples: number[] }>('generate_waveform', { path })

      const data = result.samples
      const max = Math.max(...data)
      const min = Math.min(...data)
      const range = max - min || 1

      const normalized = data.map((v) => (v - min) / range).map((v) => Math.pow(v, 1.3))

      setWaveformData(normalized)
    } catch (e) {
      console.error('waveform error:', e)
      setWaveformData(Array.from({ length: 100 }, () => 0.5))
    } finally {
      setLoading(false)
    }
  }

  return { waveformData, generateWaveform, loading }
}
