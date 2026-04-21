import { useState, useRef } from 'react'

export function useWaveform() {
  const [waveformData, setWaveformData] = useState<number[]>([])
  const [loading , setLoading] = useState(false)
  const contextRef = useRef<AudioContext | null>(null)

  async function generateWaveform(path: string) {
    setLoading(true)
    setWaveformData([])
    try {
      if (!contextRef.current) {
        contextRef.current = new AudioContext()
      }
      const ctx = contextRef.current

      const response = await fetch(path)
      if (!response.ok) throw new Error(`fetch failed: ${response.status}`)
      
      const arrayBuffer = await response.arrayBuffer()
      if (!arrayBuffer || arrayBuffer.byteLength === 0) throw new Error('empty buffer')

      const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
      const rawData = audioBuffer.getChannelData(0)

      const samples = 100
      const blockSize = Math.floor(rawData.length / samples)
      if (blockSize === 0) throw new Error('block size is 0')

      const data: number[] = []
      for (let i = 0; i < samples; i++) {
        const start = i * blockSize
        let sum = 0
        for (let j = 0; j < blockSize; j++) {
          sum += Math.abs(rawData[start + j] || 0)
        }
        data.push(sum / blockSize)
      }

      const max = Math.max(...data)
      if (max === 0) throw new Error('max is 0')

      setWaveformData(data.map(v => v / max))
    } catch (e) {
      console.error('waveform error:', e)
    } finally {
        setLoading(false)
    }
  }

  return { waveformData, generateWaveform, loading }
}