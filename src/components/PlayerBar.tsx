import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Square,
  Volume2,
  VolumeX,
  Maximize,
  Loader2,
  Video,
  VideoOff,
  X,
} from 'lucide-react'
import { useAudioPlayer } from '../hooks/useAudioPlayer'
import { useWaveform } from '../hooks/useWaveform'
import { useResizable } from '../hooks/useResizable'
import { Waveform } from './Waveform'
import { usePlayer } from '../hooks/usePlayer'
import { selectCurrentTrack, useAppStore } from '../store'
import { useFullscreen } from '../hooks/useFullscreen'
import { useCoverArt } from '../hooks/useCoverArt'
import { displayName as trackDisplayName } from '../utils/trackName'
import { TrackCover } from './TrackCover'

const MIN_HEIGHT = 128

function formatTime(s: number) {
  // e.g. the VOD of a broadcast that's still going has no fixed length yet
  if (!Number.isFinite(s)) return '--:--'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function PlayerBar() {
  const track = useAppStore(selectCurrentTrack)
  const resolving = useAppStore((s) => s.resolving)
  const { next, prev } = usePlayer()
  const { size: height, startDrag } = useResizable({
    defaultSize: MIN_HEIGHT,
    axis: 'vertical',
    storageKey: 'playmusic-playerbar-height',
  })

  const videoRef = useRef<HTMLVideoElement>(null)
  const { toggle: toggleFullscreen } = useFullscreen(videoRef)
  const { playing, duration, currentTime, toggle, stop, seek, volume, changeVolume, toggleMute } =
    useAudioPlayer(videoRef, next)

  const { waveformData, generateWaveform } = useWaveform()

  const displayName = track ? trackDisplayName(track.name) : 'No track selected'
  const trackIsVideo = useAppStore((s) => s.videoActive)
  const live = track?.source === 'online' && !!track.live
  const onlineVideo = useAppStore((s) => s.online.video)
  const setOnlineVideo = useAppStore((s) => s.setOnlineVideo)
  const cover = useCoverArt(track)
  const subtitle =
    track?.source === 'online' ? (track.uploader ?? track.platform) : track ? 'local file' : ''

  useEffect(() => {
    const path = track?.source === 'local' ? track.path : null
    generateWaveform(path)
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

      {/* Hidden while nothing is loaded (at startup and after stop); picking a track brings it
          back. It's hidden rather than unmounted: useAudioPlayer above keeps the media elements. */}
      <div
        hidden={!track}
        className="flex flex-col bg-app-bar border-t border-app-border shadow-[0_-4px_12px_var(--color-app-bar-shadow)] relative"
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

        {/* now playing · controls over the waveform · volume and video */}
        <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] items-center gap-8 px-6 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <TrackCover src={cover} video={trackIsVideo} size={52} />
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] font-mono text-app-accent tracking-[0.2em] uppercase">
                {live ? 'live now' : 'now playing'}
              </span>
              <span className="text-sm font-mono text-app-text truncate">{displayName}</span>
              <span className="text-xs font-mono text-app-muted truncate">{subtitle}</span>
            </div>
          </div>

          <div className="flex flex-col h-full min-h-0 gap-1">
            <div className="flex items-center justify-center gap-5">
              <button
                onClick={prev}
                className="text-app-secondary hover:text-app-text transition-colors"
                title="Previous"
                aria-label="Previous"
              >
                <SkipBack size={16} />
              </button>

              <button
                onClick={toggle}
                disabled={resolving}
                className="w-10 h-10 rounded-full bg-app-accent text-app-bg flex items-center justify-center hover:scale-105 transition-transform"
              >
                {resolving ? <Loader2 className="animate-spin" /> : playing ? <Pause /> : <Play />}
              </button>

              <button
                onClick={next}
                className="text-app-secondary hover:text-app-text transition-colors"
                title="Next"
                aria-label="Next"
              >
                <SkipForward size={16} />
              </button>

              <button
                onClick={stop}
                className="text-app-secondary hover:text-app-text transition-colors"
                title="Stop"
                aria-label="Stop"
              >
                <Square size={14} />
              </button>
            </div>

            <div className="flex-1 min-h-6 flex items-center gap-3 text-[11px] font-mono text-app-muted tabular-nums">
              {live ? (
                <div className="flex-1 h-full">
                  <LiveIndicator />
                </div>
              ) : (
                <>
                  <span className="w-10 text-right shrink-0">{formatTime(currentTime)}</span>
                  <div className="flex-1 h-full min-w-0">
                    <Waveform
                      data={waveformData}
                      currentTime={currentTime}
                      duration={duration}
                      onSeek={seek}
                    />
                  </div>
                  <span className="w-10 shrink-0">{formatTime(duration)}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-4">
            {track?.source === 'online' && (
              <button
                onClick={() => setOnlineVideo(!onlineVideo)}
                className={`transition-colors ${
                  onlineVideo ? 'text-app-accent' : 'text-app-muted hover:text-app-text'
                }`}
                title={onlineVideo ? 'Audio only' : 'Play video'}
              >
                {onlineVideo ? <Video size={14} /> : <VideoOff size={14} />}
              </button>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={toggleMute}
                className="text-app-muted hover:text-app-text transition-colors"
                title={volume === 0 ? 'Unmute' : 'Mute'}
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
                className="text-app-muted hover:text-app-text transition-colors"
                title="Fullscreen"
              >
                <Maximize size={14} />
              </button>
            )}

            {/* closes the player: the same as stop */}
            <div className="w-px h-4 bg-app-border" />
            <button
              onClick={stop}
              className="text-app-muted hover:text-app-text transition-colors"
              title="Close player"
              aria-label="Close player"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 px-6 py-1.5 border-t border-app-border text-[10px] font-mono text-app-muted">
          <span>
            <span className="text-app-secondary">space</span> pause/resume
          </span>
          <span>
            <span className="text-app-secondary">↑↓</span> volume
          </span>
          {!live && (
            <span>
              <span className="text-app-secondary">←→</span> seek
            </span>
          )}
          <span>
            <span className="text-app-secondary">s</span> stop
          </span>
        </div>
      </div>
    </>
  )
}

/** Takes the seek bar's place for a live stream, which has no timeline to seek in. */
function LiveIndicator() {
  return (
    <div className="h-full flex items-center gap-3" aria-label="live broadcast">
      <div className="flex-1 h-px bg-app-border" />
      <span className="flex items-center gap-2 text-xs font-mono">
        <span className="relative flex w-2 h-2">
          <span className="absolute inset-0 rounded-full bg-app-accent opacity-75 motion-safe:animate-ping" />
          <span className="relative w-2 h-2 rounded-full bg-app-accent" />
        </span>
        <span className="font-bold tracking-wider text-app-accent">LIVE</span>
        <span className="text-app-muted">broadcast</span>
      </span>
      <div className="flex-1 h-px bg-app-border" />
    </div>
  )
}
