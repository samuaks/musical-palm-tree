import { Music, Video } from 'lucide-react'
import { MediaFile } from '../types'

interface TrackProps {
  file: MediaFile
  onPlay: (file: MediaFile) => void
  isPlaying?: boolean
  query: string
}

const videoExts = ['mp4', 'mkv', 'webm', 'avi', 'mov']

function highlight(text: string, query: string) {
  if (!query) return <span>{text}</span>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <span>{text}</span>

  return (
    <>
      <span>{text.slice(0, idx)}</span>
      <span className="text-teal-400 underline">{text.slice(idx, idx + query.length)}</span>
      <span>{text.slice(idx + query.length)}</span>
    </>
  )
}

export function Track({ file, onPlay, isPlaying = false, query   }: TrackProps) {
  const displayName = file.name.replace(/\.[^/.]+$/, '') 
  const isVideo = videoExts.includes(file.ext.toLowerCase())

  return (
    <div
      onClick={() => onPlay(file)}
      className={`flex flex-col px-6 py-2 cursor-pointer hover:bg-white/5 transition-colors ${
        isPlaying ? 'border-l-2 border-teal-400' : 'border-l-2 border-transparent'
      }`}
    >
    
      <span className={`text-sm font-mono ${isPlaying ? 'text-teal-400' : 'text-slate-300'}`}>
        {highlight(displayName, query)}
      </span>
        <div className="text-slate-500">
        {isVideo ? <Video size={14} />:  <Music size={14} />}
      </div>
      <span className="text-xs font-mono text-slate-500">
        {/*isPlaying ? '▶ ' : ''}{file.ext.toUpperCase()*/}
      </span>
    </div>
  )
}