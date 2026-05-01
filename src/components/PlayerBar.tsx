import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Maximize } from 'lucide-react'
import { useAudioPlayer } from '../hooks/useAudioPlayer'
import { useWaveform } from '../hooks/useWaveform'
import { useResizable } from '../hooks/useResizable'
import { Waveform } from './Waveform'
import { isVideo } from '../constants'
import { usePlayer } from '../hooks/usePlayer'
import { useAppStore } from '../store'
import { useFullscreen } from '../hooks/useFullscreen'

const MIN_HEIGHT = 160

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function PlayerBar() {
  const track = useAppStore((s) => s.currentTrack)
  const { next, prev } = usePlayer()
  const { size: height, startDrag } = useResizable({
    defaultSize: MIN_HEIGHT,
    axis: 'vertical',
    storageKey: 'playmusic-playerbar-height',
  })

  const videoRef = useRef<HTMLVideoElement>(null)
  const { toggle: toggleFullscreen } = useFullscreen(videoRef)
  const { playing, duration, currentTime, toggle, seek, volume, changeVolume, toggleMute } =
    useAudioPlayer(videoRef, next)

  const { waveformData, generateWaveform, loading } = useWaveform()

  const displayName = track?.name.replace(/\.[^/.]+$/, '') ?? 'No track selected'
  const trackIsVideo = track ? isVideo(track.ext) : false

  useEffect(() => {
    if (!track) return
    generateWaveform(track.path)
  }, [track])

  return (
    <>
      {createPortal(
        <video
          ref={videoRef}
          className={`w-full h-full ${track && trackIsVideo ? 'block' : 'hidden'}`}
          style={{ objectFit: 'contain' }}
          onDoubleClick={toggleFullscreen}
        />,
        document.getElementById('video-pane') ?? document.body
      )}

      <div
        className="flex flex-col border-t border-app-border relative"
        style={{ height: `${height}px` }}
      >
        {/* drag handle */}
        <div
          onMouseDown={startDrag}
          className="absolute top-0 left-0 right-0 cursor-ns-resize z-10 group"
          style={{ height: '12px', transform: 'translateY(-6px)' }}
        >
          <div className="absolute top-1/2 left-0 right-0 h-px -translate-y-1/2 group-hover:bg-app-accent-dim transition-colors" />
        </div>

        {/* top row — track info + controls */}
        <div className="flex items-center px-6 pt-3 pb-2 gap-4">
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-sm font-mono text-app-accent truncate">{displayName}</span>
            <span className="text-xs font-mono text-app-muted tabular-nums">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={prev}
              className="text-app-secondary hover:text-app-text transition-colors"
            >
              <SkipBack size={16} />
            </button>

            <button
              onClick={toggle}
              className="w-10 h-10 rounded-full bg-app-accent text-app-bg flex items-center justify-center hover:scale-105 transition-transform"
            >
              {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
            </button>

            <button
              onClick={next}
              className="text-app-secondary hover:text-app-text transition-colors"
            >
              <SkipForward size={16} />
            </button>
          </div>

          <div className="flex items-center gap-3 flex-1 justify-end">
            <button
              onClick={toggleMute}
              className="text-app-muted hover:text-app-text transition-colors"
            >
              {volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => changeVolume(Number(e.target.value))}
              onMouseUp={(e) => (e.target as HTMLInputElement).blur()}
              className="w-24 accent-app-accent"
            />
          </div>

          {track && trackIsVideo && (
            <button
              onClick={toggleFullscreen}
              className="text-app-muted  hover:text-app-text transition-colors"
              title="Fullscreen"
            >
              <Maximize size={14} />
            </button>
          )}
        </div>

        <div className="flex-1 px-6 pb-2 min-h-0">
          <Waveform
            data={waveformData}
            currentTime={currentTime}
            duration={duration}
            onSeek={seek}
            loading={loading}
          />
        </div>

        <div className="flex items-center gap-4 px-6 py-1.5 border-t border-app-border text-[10px] font-mono text-app-muted">
          <span>
            <span className="text-app-secondary">space</span> pause/resume
          </span>
          <span>
            <span className="text-app-secondary">↑↓</span> volume
          </span>
          <span>
            <span className="text-app-secondary">←→</span> seek
          </span>
        </div>
      </div>
    </>
  )
}
