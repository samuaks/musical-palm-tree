import { useEffect, useRef, useState } from 'react'
import { MediaFile } from '../types'
import { Music, Video, ChevronUp, ChevronDown, Play, Pause, SkipBack, SkipForward, VolumeX, Volume1, Volume2 } from 'lucide-react'
import { useAudioPlayer } from '../hooks/useAudioPlayer'


interface PlayerBarProps {
  track: MediaFile | null
  onNext?: () => void
  onPrev?: () => void
}

const videoExts = ['mp4', 'mkv', 'webm', 'avi', 'mov']

function formatTime(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}


export function PlayerBar({ track, onNext, onPrev }: PlayerBarProps) {
  const [expanded, setExpanded] = useState(false)
  const isVideo = track ? videoExts.includes(track.ext.toLowerCase()) : false

  const audioRef = useRef<HTMLAudioElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const mediaRef = (isVideo ? videoRef : audioRef) as React.RefObject<HTMLVideoElement | HTMLAudioElement>

  const { playing, duration, currentTime, toggle, seek, volume, changeVolume } =
    useAudioPlayer(track, mediaRef, onNext)

  useEffect(() => {
    if (isVideo) setExpanded(true)
  }, [track])

  useEffect(() => {
  if (isVideo) {
    audioRef.current?.pause()
  } else {
    videoRef.current?.pause()
  }
}, [isVideo])

  const displayName = track?.name.replace(/\.[^/.]+$/, '') ?? 'No track selected'
  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2



  return (
   <div className={`shrink-0 border-t border-slate-700 transition-all duration-300 ${
  expanded ? 'h-128' : 'h-14'
}`}>
      <audio ref={audioRef} />
      <video
        ref={videoRef}
        className="w-full rounded bg-black"
        style={{
          maxHeight: '420px',
          display: expanded && isVideo ? 'block' : 'none'
        }}
      />

      <div className="flex items-center gap-3 px-4 h-14">
        <div className="text-slate-500">
          {isVideo ? <Video size={14} /> : <Music size={14} />}
        </div>

        <span className="text-slate-300 text-sm font-mono truncate flex-1">
          {displayName}
        </span>

        <div className="flex items-center gap-3">
          <button tabIndex={-1} onMouseDown={e => e.preventDefault()} onClick={onPrev} className="text-slate-500 hover:text-slate-300 transition-colors">
            <SkipBack size={14} />
          </button>
          <button tabIndex={-1} onMouseDown={e => e.preventDefault()} onClick={toggle} className="text-teal-400 hover:text-teal-300 transition-colors">
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button tabIndex={-1} onMouseDown={e => e.preventDefault()} onClick={onNext} className="text-slate-500 hover:text-slate-300 transition-colors">
            <SkipForward size={14} />
          </button>
        </div>

        <span className="text-slate-500 text-xs font-mono w-20 text-right">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        <div className="flex items-center gap-2 ml-2">
          <VolumeIcon size={14} className="text-slate-500 shrink-0" />
          <input
            type="range"
            min={0}
            max={1}
                tabIndex={-1}
          onMouseUp={e => (e.target as HTMLInputElement).blur()}
            step={0.01}
            value={volume}
            onChange={e => changeVolume(Number(e.target.value))}
            className="w-20 accent-teal-400"
          />
        </div>

        <button
          tabIndex={-1}
          onMouseDown={e => e.preventDefault()}
          onClick={() => setExpanded(!expanded)}
          className="text-slate-500 hover:text-slate-300 transition-colors ml-2"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-3 overflow-hidden">
          <input
            type="range"
            min={0}
            tabIndex={-1}
            max={duration}
            onMouseUp={e => (e.target as  HTMLInputElement).blur()}
            value={currentTime}
            onChange={e => seek(Number(e.target.value))}
            className="w-full accent-teal-400"
          />
  
        </div>
      )}
    </div>
  )
}