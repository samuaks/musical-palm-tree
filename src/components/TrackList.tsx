import { MediaFile } from '../types'
import { Track } from './Track'

interface TrackListProps {
  files: MediaFile[]
  dirName: string
  albumName?: string | null
}

export function TrackList({ files, dirName, albumName = null }: TrackListProps) {
  if (files.length === 0) return null

  return (
    <div className="flex flex-col">
      {files.map((file) => (
        <Track key={file.path} file={file} dirName={dirName} albumName={albumName} />
      ))}
    </div>
  )
}
