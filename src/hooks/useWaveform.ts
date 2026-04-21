import { useState, useRef } from 'react'

const CHUNK_SIZE = 1024 * 1024 * 2 // 2MB max for waveform

export function useWaveform() {
  const [waveformData, setWaveformData] = useState<number[]>([])
  const [loading, setLoading] = useState(false)
  const contextRef = useRef<AudioContext | null>(null)

  async function generateWaveform(path: string): Promise<void> {
    setWaveformData([])
    setLoading(true)
    try {
      if (!contextRef.current) {
        contextRef.current = new AudioContext()
      }
      const ctx = contextRef.current

      // only fetch first 2MB of file
      const response = await fetch(path, {
        headers: { Range: `bytes=0-${CHUNK_SIZE}` }
      })

      if (!response.ok && response.status !== 206) {
        throw new Error(`fetch failed: ${response.status}`)
      }

      const arrayBuffer = await response.arrayBuffer()
      if (!arrayBuffer || arrayBuffer.byteLength === 0) throw new Error('empty buffer')

      let audioBuffer: AudioBuffer
      try {
        audioBuffer = await ctx.decodeAudioData(arrayBuffer)
      } catch {
        // partial file may fail to decode — try with full file as fallback
        const fullResponse = await fetch(path)
        const fullBuffer = await fullResponse.arrayBuffer()
        audioBuffer = await ctx.decodeAudioData(fullBuffer)
      }

      const rawData = audioBuffer.getChannelData(0)
      const samples = 100
      const blockSize = Math.floor(rawData.length / samples)
      if (blockSize === 0) throw new Error('block size is 0')

      const data: number[] = []
      for (let i = 0; i < samples; i++) {
        const start = i * blockSize
        let sum = 0
        for (let j = 0; j < blockSize; j += 10) {
          sum += Math.abs(rawData[start + j] || 0)
        }
        data.push(sum / (blockSize / 10))
      }

      const max = Math.max(...data)
      if (max === 0) throw new Error('max is 0')

      setWaveformData(data.map(v => v / max))
    } catch (e) {
      console.error('waveform error:', e)
      setWaveformData(Array.from({ length: 100 }, () => 0.5))
    } finally {
      setLoading(false)
    }
  }

  return { waveformData, generateWaveform, loading }
}