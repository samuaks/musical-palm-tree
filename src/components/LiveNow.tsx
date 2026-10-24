import { Play, RefreshCw, X } from 'lucide-react'
import { selectCurrentTrack, useAppStore } from '../store'
import { resultToTrack } from '../api/online'
import { useTwitchChannels } from '../hooks/useTwitchChannels'
import { OnlineSearchResult } from '../types'
import { TwitchChannel } from '../utils/plays'
import { formatRelative } from '../utils/format'

/**
 * Home's "live now": the Twitch channels you've watched that are streaming right now (from the
 * sidebar's live check), as preview tiles that play the stream. × hides a channel everywhere
 * (`hideChannel`, persisted); Explore brings it back.
 */
export function LiveNow() {
  const channels = useTwitchChannels()
  const liveStreams = useAppStore((s) => s.online.liveStreams)
  const checkedAt = useAppStore((s) => s.online.liveCheckedAt)
  const checking = useAppStore((s) => s.online.liveChecking)
  const checkLiveNow = useAppStore((s) => s.checkLiveNow)
  const onlineReady = useAppStore((s) => s.ytDlp?.available === true)
  if (!onlineReady || channels.length === 0) return null

  const live = channels.flatMap((channel) => {
    const stream = liveStreams.get(channel.name)
    return stream ? [{ channel, stream }] : []
  })

  return (
    <div className="mb-2">
      <div className="flex items-center gap-3 px-6 mt-6 mb-3">
        <span className="flex items-center gap-2 text-xs font-mono text-app-accent tracking-widest uppercase shrink-0">
          {live.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-app-accent" />}
          live now
        </span>
        <span className="text-[10px] font-mono text-app-muted tracking-widest uppercase shrink-0">
          your twitch channels
        </span>
        <div className="flex-1 h-px bg-app-border" />
        <button
          onClick={checkLiveNow}
          disabled={checking}
          title={checking ? 'checking...' : checkedAt ? `checked ${formatRelative(checkedAt)}` : ''}
          className="flex items-center gap-1.5 text-xs font-mono text-app-secondary hover:text-app-text shrink-0 transition-colors"
        >
          <RefreshCw size={12} className={checking ? 'animate-spin' : ''} />
          {checking ? 'checking' : checkedAt ? formatRelative(checkedAt) : 'check'}
        </button>
      </div>

      {live.length === 0 ? (
        <div className="px-6 py-1 text-xs font-mono text-app-muted">
          {checkedAt
            ? channels.length === 1
              ? `${channels[0].display} isn't live right now.`
              : `none of your ${channels.length} channels are live right now.`
            : 'checking which of your channels are live...'}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 px-6">
          {live.map(({ channel, stream }) => (
            <LiveTile key={channel.name} channel={channel} stream={stream} />
          ))}
        </div>
      )}
    </div>
  )
}

/** A live channel: preview, channel, stream title; plays the stream on its own. */
function LiveTile({ channel, stream }: { channel: TwitchChannel; stream: OnlineSearchResult }) {
  const playTrackFromList = useAppStore((s) => s.playTrackFromList)
  const hideChannel = useAppStore((s) => s.hideChannel)
  const isActive = useAppStore((s) => {
    const current = selectCurrentTrack(s)
    return current?.source === 'online' && current.videoId === stream.video_id
  })

  return (
    <div
      onClick={() => playTrackFromList([resultToTrack(stream)], 0)}
      data-track-path={stream.video_id}
      className={`group relative rounded-md border overflow-hidden cursor-pointer transition-colors ${
        isActive
          ? 'border-app-accent bg-app-selected'
          : 'border-app-border bg-app-surface hover:bg-app-hover'
      }`}
    >
      <div className="relative aspect-video bg-app-skeleton">
        {stream.thumbnail && (
          <img
            src={stream.thumbnail}
            alt=""
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        <span className="absolute top-2 left-2 flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-app-accent text-app-accent-text text-[10px] font-mono font-bold tracking-wider">
          LIVE
        </span>
        <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="w-10 h-10 rounded-full bg-app-accent text-app-accent-text flex items-center justify-center">
            <Play size={18} />
          </span>
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation()
            hideChannel(channel.name)
          }}
          title={`hide ${channel.display} (bring it back from Explore)`}
          aria-label={`hide ${channel.display}`}
          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-app-bar text-app-secondary hover:text-app-text flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
        >
          <X size={14} />
        </button>
      </div>
      <div className="px-3 py-2 min-w-0">
        <div
          className={`text-sm font-mono truncate ${isActive ? 'text-app-accent' : 'text-app-text'}`}
        >
          {channel.display}
        </div>
        <div className="text-xs font-mono text-app-secondary truncate" title={stream.title}>
          {stream.title}
        </div>
      </div>
    </div>
  )
}
