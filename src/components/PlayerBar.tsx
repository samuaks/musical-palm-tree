import { useEffect, useRef } from 'react'
import { MediaFile } from '../types'
import {
  Music,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  VolumeX,
  Volume2,
  Volume1,
  Video,
} from 'lucide-react'
import { isVideo as isVideoExt } from '../constants'
import { useAudioPlayer } from '../hooks/useAudioPlayer'
import { useWaveform } from '../hooks/useWaveform'
import { Waveform } from './Waveform'
import { useResizable } from '../hooks/useResizable'
import { createPortal } from 'react-dom'

interface PlayerBarProps {
  track: MediaFile | null
  onNext?: () => void
  onPrev?: () => void
}

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

const MIN_HEIGHT = 128

export function PlayerBar({ track, onNext, onPrev }: PlayerBarProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const { size: height, startDrag } = useResizable({
    defaultSize: MIN_HEIGHT,
    maxFromViewport: 120,
    axis: 'vertical',
  })

  const { playing, duration, currentTime, toggle, seek, volume, changeVolume, toggleMute } =
    useAudioPlayer(track, videoRef, onNext)
  const { waveformData, generateWaveform, loading } = useWaveform()
  const displayName = track?.name.replace(/\.[^/.]+$/, '') ?? 'No track selected'
  const trackIsVideo = track ? isVideoExt(track.ext) : null

  useEffect(() => {
    if (!track) return
    generateWaveform(track.path)
  }, [track])

  const VolumeIcon = volume === 0 ? VolumeX : volume > 0.5 ? Volume2 : Volume1

  return (
    <>
      {createPortal(
        <video
          ref={videoRef}
          className={`w-full h-full ${track && isVideoExt(track.ext) ? 'block' : 'hidden'}`}
          style={{ objectFit: 'contain' }}
        />,
        document.getElementById('video-pane') ?? document.body
      )}
      <div
        className={`shrink-0 border-t border-app-border relative flex flex-col `}
        style={{ height: `${height}px` }}
      >
        <div
          onMouseDown={startDrag}
          className="absolute top-0 left-0 right-0 cursor-ns-resize z-10 group"
          style={{ height: '12px', transform: 'translateY(-6px)' }}
        >
          <div className="absolute top-1/2 left-0 right-0 h-1 -translate-y-1/2 group-hover:bg-teal-400/30 transition-colors" />
        </div>

        <div className="shrink-0" style={{ height: `${MIN_HEIGHT}px` }}>
          <div className="flex items-center gap-3 px-4 h-14">
            <div className="text-slate-500">
              {trackIsVideo ? <Video size={14} /> : <Music size={14} />}
            </div>

            <span className="text-slate-300 text-sm font-mono truncate flex-1">{displayName}</span>

            <div className="flex items-center gap-3">
              <button
                onMouseUp={(e) => (e.target as HTMLInputElement).blur()}
                onClick={onPrev}
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                <SkipBack size={14} />
              </button>
              <button
                onMouseUp={(e) => (e.target as HTMLInputElement).blur()}
                onClick={toggle}
                className="text-teal-400 hover:text-teal-300 transition-colors"
              >
                {playing ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <button
                onMouseUp={(e) => (e.target as HTMLInputElement).blur()}
                onClick={onNext}
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                <SkipForward size={14} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleMute}
                tabIndex={-1}
                onMouseUp={(e) => (e.target as HTMLInputElement).blur()}
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                <VolumeIcon size={14} />
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => changeVolume(Number(e.target.value))}
                onMouseUp={(e) => (e.target as HTMLInputElement).blur()}
                className="w-16 accent-teal-400"
              />
            </div>

            <span className="text-slate-500 text-xs font-mono w-20 text-right">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="px-4 pb-3 flex flex-col gap-1">
            <Waveform
              loading={loading}
              data={waveformData}
              currentTime={currentTime}
              duration={duration}
              seek={seek}
            />
          </div>
        </div>
      </div>
    </>
  )
}
