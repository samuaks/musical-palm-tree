import { MediaFile } from "../types";
import { Track } from "./Track";

interface TrackListProps {
    files: MediaFile[]
    currentTrack: MediaFile | null
    query: string
    onPlay: (file: MediaFile) => void

}

export function TrackList({ files, currentTrack, query, onPlay }: TrackListProps) {
    if (files.length === 0) return null

   return (
    <div className="flex flex-col overflow-y-auto">
      {files.map(file => (
        <Track
          key={file.path}
          file={file}
          query={query}
          onPlay={onPlay}
          isPlaying={currentTrack?.path === file.path}
        />
      ))}
    </div>
  )
}