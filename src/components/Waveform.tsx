import { useState } from 'react'

interface WaveformProps {
  /** Normalized bar heights; empty while generating or when there's no waveform. */
  data: number[]
  currentTime: number
  duration: number
  onSeek: (time: number) => void
}
const MAX_BAR_HEIGHT = 80
const MIN_BAR_HEIGHT = 15
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
  return (
    <div className="w-full h-full flex items-end gap-0.5">
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
