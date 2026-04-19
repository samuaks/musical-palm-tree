import { useMemo } from "react"

interface WaveformProps {
    data: number[]
    currentTime: number
    duration: number
    seek: (time: number) => void
    loading?: boolean
}

export function Waveform({
    data,
    currentTime,
    duration,
    seek,
    loading
}:WaveformProps) {
    const progress = duration > 0 ? currentTime / duration : 0

    const skeletonHeights = useMemo(() => 
        Array.from({ length: 100 }).map(() => Math.max(8, Math.random() * 100)), 
    [])

    function handleClick(e: React.MouseEvent<HTMLDivElement>) {
        const rect = e.currentTarget.getBoundingClientRect()
        const x = (e.clientX - rect.left)  / rect.width
        seek(x* duration)
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault()
            const delta = e.key === 'ArrowLeft' ? -5 : 5
            seek(Math.max(0, Math.min(duration, currentTime + delta)))
        }
    }

    if (!loading && data.length === 0) {
        return (
            <div className="w-full h-16 flex items-center justify-center" />
        )
    }

   if (loading && data.length === 0) {
  return (
    <div className="w-full flex items-end gap-px" style={{ height: '64px' }}>
      {skeletonHeights.map((h, i) => (
        <div
          key={i}
          style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1px' }}
        >
          <div style={{
            width: '100%',
            height: `${h * 0.4}%`,
            background: '#334155',
            opacity: 0.9,
            borderRadius: '2px 2px 0 0',
          }} className="animate-pulse" />
          <div style={{
            width: '100%',
            height: `${h * 0.6}%`,
            background: '#334155',
            borderRadius: '0 0 2px 2px',
          }} className="animate-pulse" />
        </div>
      ))}
    </div>
  )
}

    return (
        <div role="slider" aria-label="audio progress" aria-valuenow={Math.round(currentTime)} aria-valuemin={0} aria-valuemax={Math.round(duration)}
            tabIndex={0}
              onMouseUp={e => (e.target as HTMLInputElement).blur()}
            className="w-full h-16 flex items-end gap-px cursor-pointer select-none focus:outline-none"
              style={{ height: '64px', background: 'transparent' }}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            >
                {data.map((v, i) => {
                    const barProgress = i / data.length
                    const played = barProgress < progress
                    const isHead = Math.abs(barProgress - progress) < 0.015
                    const barHeight = Math.max(4, v * 100)
                    const color = isHead ? '#2dd4bf' : played ? '#0d9488' : '#475569'

                    return (
                         <div
              key={i}
              style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1px' }}
            >
              <div style={{
                width: '100%',
                height: `${barHeight * 0.4}%`,
                background: color,
                opacity: 0.9,
                borderRadius: '2px 2px 0 0',
              }} />
              <div style={{
                width: '100%',
                height: `${barHeight * 0.6}%`,
                background: color,
                borderRadius: '0 0 2px 2px',
              }} />
            </div>
                    )
                })}
            </div>
    )
}