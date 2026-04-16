import { MediaFile } from "../types";

interface TrackProps {
    file: MediaFile
    onPlay: (file: MediaFile) => void
    isPlaying?: boolean
}

export function Track({ file, onPlay, isPlaying }: TrackProps) {
 return (
    <div
      onClick={() => onPlay(file)}
      className={`flex items-center gap-3 px-4 py-2 rounded-lg cursor-pointer hover:bg-zinc-800 transition-colors ${
        isPlaying ? 'bg-zinc-700' : ''
      }`}
    >
      <div className="text-zinc-400 text-sm w-4">
        {isPlaying ? '▶' : '♪'}
      </div>
      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-sm text-white truncate">{file.name}</span>
        <span className="text-xs text-zinc-400 uppercase">{file.ext}</span>
      </div>
    </div>
  )
} 