import { MediaFile } from '../types'
import { Track } from './Track'

interface TrackListProps {
  files: MediaFile[]
}

export function TrackList({ files }: TrackListProps) {
  if (files.length === 0) return null

  return (
    <div className="flex flex-col overflow-y-auto">
      {files.map((file, i) => (
        <Track index={i} key={file.path} file={file} />
      ))}
    </div>
  )
}
