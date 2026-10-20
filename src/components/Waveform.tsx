import { useMemo, useRef, useState } from 'react'
import { useElementWidth } from '../hooks/useElementWidth'

interface WaveformProps {
  /** Normalized bar heights; empty while generating or when there's no waveform. */
  data: number[]
  currentTime: number
  duration: number
  onSeek: (time: number) => void
}
const MAX_BAR_HEIGHT = 80
const MIN_BAR_HEIGHT = 8
// Thin bars to match the 1.5-2px icon strokes; as many as fit the width.
const BAR_WIDTH = 2
const BAR_GAP = 2
const FADE = 'transition-opacity duration-300'

/**
 * Seek bar for the player. It's always usable: a plain progress line is shown until the
 * waveform arrives (and for tracks that have none, e.g. online streams or unsupported
 * codecs), then the bars fade in over it.
 */
export function Waveform({ data, currentTime, duration, onSeek }: WaveformProps) {
  const [hoverPct, setHoverPct] = useState<number | null>(null)
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0
  const hasBars = data.length > 0

  function pctAt(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowRight') onSeek(Math.min(currentTime + 5, duration))
    if (e.key === 'ArrowLeft') onSeek(Math.max(currentTime - 5, 0))
  }

  return (
    <div
      role="slider"
      aria-label="audio progress"
      aria-valuenow={Math.round(currentTime)}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      tabIndex={0}
      className="relative w-full h-full cursor-pointer select-none focus:outline-none"
      onClick={(e) => onSeek(pctAt(e) * duration)}
      onKeyDown={handleKeyDown}
      onMouseMove={(e) => setHoverPct(pctAt(e))}
      onMouseLeave={() => setHoverPct(null)}
    >
      {/* Shown at once when there are no bars; fades out when they arrive. */}
      <div className={`absolute inset-0 ${hasBars ? `opacity-0 ${FADE}` : 'opacity-100'}`}>
        <ProgressLine progress={progress} hoverPct={hoverPct} />
      </div>
      <div className={`absolute inset-0 ${FADE} ${hasBars ? 'opacity-100' : 'opacity-0'}`}>
        <Bars data={data} progress={progress} hoverPct={hoverPct} />
      </div>
    </div>
  )
}

function ProgressLine({ progress, hoverPct }: { progress: number; hoverPct: number | null }) {
  const preview = hoverPct !== null && hoverPct > progress ? hoverPct - progress : 0
  // When hovering behind the playhead, dim the part that would be skipped back over.
  const rewind = hoverPct !== null && hoverPct < progress ? hoverPct : null

  return (
    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-app-waveform">
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{
          width: `${progress * 100}%`,
          background:
            rewind === null
              ? 'var(--color-app-accent)'
              : `linear-gradient(to right, var(--color-app-accent) ${(rewind / progress) * 100}%, var(--color-app-accent-rewind) 0)`,
        }}
      />
      {preview > 0 && (
        <div
          className="absolute inset-y-0 rounded-full"
          style={{
            left: `${progress * 100}%`,
            width: `${preview * 100}%`,
            background: 'var(--color-app-accent-dim)',
          }}
        />
      )}
      <div
        className="absolute top-1/2 w-2.5 h-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-app-text"
        style={{ left: `${progress * 100}%` }}
      />
    </div>
  )
}

function Bars({
  data,
  progress,
  hoverPct,
}: {
  data: number[]
  progress: number
  hoverPct: number | null
}) {
  const ref = useRef<HTMLDivElement>(null)
  const width = useElementWidth(ref)
  const count = Math.max(1, Math.floor((width + BAR_GAP) / (BAR_WIDTH + BAR_GAP)))
  const bars = useMemo(() => (width > 0 ? resample(data, count) : []), [data, count, width])
  const head = Math.min(bars.length - 1, Math.floor(progress * bars.length))

  return (
    <div ref={ref} className="w-full h-full flex items-end" style={{ gap: `${BAR_GAP}px` }}>
      {bars.map((v, i) => {
        const barProgress = i / bars.length
        const played = i < head
        const isHoverPreview = hoverPct !== null && barProgress <= hoverPct && !played

        const barHeight = Math.min(MAX_BAR_HEIGHT, Math.max(MIN_BAR_HEIGHT, v * 100))

        let color = 'var(--color-app-waveform)'
        if (i === head) color = 'var(--color-app-text)'
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
            className="shrink-0 rounded-full"
            style={{ width: `${BAR_WIDTH}px`, height: `${barHeight}%`, background: color }}
          />
        )
      })}
    </div>
  )
}

/**
 * Resamples the waveform to exactly `count` bars. Each bar shows the loudest point it
 * covers, so short peaks survive; with fewer points than bars, points are stretched.
 */
function resample(data: number[], count: number): number[] {
  if (data.length === 0) return []
  return Array.from({ length: count }, (_, i) => {
    const start = Math.floor((i * data.length) / count)
    const end = Math.max(start + 1, Math.floor(((i + 1) * data.length) / count))
    let peak = 0
    for (let j = start; j < end; j++) peak = Math.max(peak, data[j])
    return peak
  })
}
