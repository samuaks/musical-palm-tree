import { Loader2, Music, Video } from 'lucide-react'
import { PlayingIndicator } from './PlayingIndicator'

interface TrackCoverProps {
  src: string | null
  video: boolean
  size?: number
  /** Show a small video badge on real art, so the media type stays visible. */
  markVideo?: boolean
  loading?: boolean
  /** The current track: shows the playing indicator over the cover. */
  active?: boolean
  playing?: boolean
}

/**
 * A track's cover art, or a placeholder tile with a music or video icon when it has none. Used
 * by list rows and the player bar.
 */
export function TrackCover({
  src,
  video,
  size = 40,
  markVideo = false,
  loading = false,
  active = false,
  playing = false,
}: TrackCoverProps) {
  const icon = Math.round(size * 0.4)
  return (
    <div
      className="relative shrink-0 rounded overflow-hidden bg-app-skeleton flex items-center justify-center text-app-muted"
      style={{ width: size, height: size }}
    >
      {src ? (
        <img src={src} alt="" draggable={false} className="w-full h-full object-cover" />
      ) : video ? (
        <Video size={icon} />
      ) : (
        <Music size={icon} />
      )}
      {src && video && markVideo && (
        <span className="absolute bottom-0.5 right-0.5 rounded-sm bg-app-bg/80 p-0.5 text-app-text">
          <Video size={10} />
        </span>
      )}
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center bg-app-bg/60">
          <Loader2 size={icon} className="animate-spin text-app-accent" />
        </div>
      ) : (
        active && (
          <div className="absolute inset-0 flex items-center justify-center bg-app-bg/60">
            <div style={{ width: icon }}>
              <PlayingIndicator playing={playing} />
            </div>
          </div>
        )
      )}
    </div>
  )
}
