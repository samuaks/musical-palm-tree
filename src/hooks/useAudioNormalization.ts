import { useEffect, useRef } from 'react'

//fix plz
export function useAudioNormalization(audioRef: React.RefObject<HTMLAudioElement>) {
  const audioContextRef = useRef<AudioContext | null>(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (!audioRef.current || initialized.current) return
    initialized.current = true

    const ctx = new AudioContext()
    audioContextRef.current = ctx

    const source = ctx.createMediaElementSource(audioRef.current)

    const compressor = ctx.createDynamicsCompressor()
    compressor.threshold.value = -24
    compressor.knee.value = 30
    compressor.ratio.value = 12
    compressor.attack.value = 0.003
    compressor.release.value = 0.25

    const gain = ctx.createGain()
    gain.gain.value = 1.5

    source.connect(compressor)
    compressor.connect(gain)
    gain.connect(ctx.destination)

    function resume() {
      if (ctx.state === 'suspended') {
        ctx.resume()
      }
    }

    document.addEventListener('click', resume)
    document.addEventListener('keydown', resume)

    return () => {
      document.removeEventListener('click', resume)
      document.removeEventListener('keydown', resume)
      ctx.close()
    }
  }, [audioRef])
}
