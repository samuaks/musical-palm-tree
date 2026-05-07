import { useMemo, useState } from 'react'

interface WaveformProps {
  data: number[]
  currentTime: number
  duration: number
  onSeek: (time: number) => void
  loading?: boolean
}
const MAX_BAR_HEIGHT = 80
const MIN_BAR_HEIGHT = 15

export function Waveform({ data, currentTime, duration, onSeek, loading = false }: WaveformProps) {
  const [hoverPct, setHoverPct] = useState<number | null>(null)
  const progress = duration > 0 ? currentTime / duration : 0

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    setHoverPct(pct)
  }

  function handleMouseLeave() {
    setHoverPct(null)
  }

  const skeletonHeights = useMemo(
    () => Array.from({ length: 100 }, () => Math.max(20, Math.random() * 100)),
    []
  )

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    onSeek(pct * duration)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowRight') onSeek(Math.min(currentTime + 5, duration))
    if (e.key === 'ArrowLeft') onSeek(Math.max(currentTime - 5, 0))
  }

  if (loading && data.length === 0) {
    return (
      <div className="w-full h-full flex items-end gap-0.5">
        {skeletonHeights.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm bg-app-skeleton animate-pulse"
            style={{ height: `${h * 0.5}%` }}
          />
        ))}
      </div>
    )
  }

  if (data.length === 0) {
    return <div className="w-full h-full" />
  }

  return (
    <div
      role="slider"
      aria-label="audio progress"
      aria-valuenow={Math.round(currentTime)}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      tabIndex={0}
      className="w-full h-full flex items-end gap-0.5 cursor-pointer select-none focus:outline-none"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {data.map((v, i) => {
        const barProgress = i / data.length
        const played = barProgress < progress
        const isHead = Math.abs(barProgress - progress) < 0.015
        const isHoverPreview = hoverPct !== null && barProgress <= hoverPct && !played

        const barHeight = Math.min(MAX_BAR_HEIGHT, Math.max(MIN_BAR_HEIGHT, v * 100))

        let color = 'var(--color-app-waveform)'
        if (isHead) color = 'var(--color-app-text)'
        else if (played) {
          // if hovering on played territory, dim bars between hover and head
          if (hoverPct !== null && barProgress >= hoverPct) {
            color = 'var(--color-app-accent-rewind)' // dimmer played color
          } else {
            color = 'var(--color-app-accent)'
          }
        } else if (isHoverPreview) {
          color = 'var(--color-app-accent-dim)'
        }

        return (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${barHeight}%`,
              background: color,
              borderRadius: '2px',
            }}
          />
        )
      })}
    </div>
  )
}
