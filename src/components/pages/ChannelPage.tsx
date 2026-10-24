import { ReactNode, useEffect, useState } from 'react'
import { AlertCircle, Loader2, RefreshCw, Tv } from 'lucide-react'
import { useAppStore } from '../../store'
import { resultToTrack, searchOnline } from '../../api/online'
import { OnlineSearchResult } from '../../types'
import { useTwitchChannels } from '../../hooks/useTwitchChannels'
import { ResultRow } from '../OnlineSection'
import { PageHeader } from './PageHeader'

/** A channel's listing is reused for this long when you come back to its page. */
const FRESH_MS = 2 * 60 * 1000
const listings = new Map<string, { at: number; results: OnlineSearchResult[] }>()
/** Listings being fetched, so a page opened twice (or a remount) shares one yt-dlp run. */
const pending = new Map<string, Promise<OnlineSearchResult[]>>()

function listChannel(name: string): Promise<OnlineSearchResult[]> {
  let request = pending.get(name)
  if (!request) {
    request = searchOnline(name, 'twitch')
      .then((results) => {
        listings.set(name, { at: Date.now(), results })
        return results
      })
      .finally(() => pending.delete(name))
    pending.set(name, request)
  }
  return request
}

type Listing =
  | { name: string; state: 'loading' }
  | { name: string; state: 'done'; results: OnlineSearchResult[] }
  | { name: string; state: 'error'; error: string }

/**
 * A Twitch channel (from the sidebar's CHANNELS): its live stream on top, if it's live, then its
 * recent VODs. The same listing as the Twitch tab's, kept apart from the Explore results.
 */
export function ChannelPage({ name }: { name: string }) {
  const display = useTwitchChannels().find((c) => c.name === name)?.display ?? name
  const liveDot = useAppStore((s) => s.online.liveChannels.has(name))
  const onlineReady = useAppStore((s) => s.ytDlp?.available !== false)
  const playTrackFromList = useAppStore((s) => s.playTrackFromList)
  const [listing, setListing] = useState<Listing>({ name, state: 'loading' })
  const [reload, setReload] = useState(0)

  useEffect(() => {
    const cached = listings.get(name)
    if (reload === 0 && cached && Date.now() - cached.at < FRESH_MS) {
      setListing({ name, state: 'done', results: cached.results })
      return
    }
    let cancelled = false
    setListing({ name, state: 'loading' })
    listChannel(name)
      .then((results) => {
        if (!cancelled) setListing({ name, state: 'done', results })
      })
      .catch((e) => {
        if (!cancelled) setListing({ name, state: 'error', error: String(e) })
      })
    return () => {
      cancelled = true
    }
  }, [name, reload])

  // a listing for another channel is still on screen for a moment after switching
  const current = listing.name === name ? listing : { name, state: 'loading' as const }
  const results = current.state === 'done' ? current.results : []
  const live = current.state === 'done' ? results[0]?.live === true : liveDot

  function handlePlay(result: OnlineSearchResult) {
    const idx = results.findIndex((r) => r.video_id === result.video_id)
    if (idx >= 0) playTrackFromList(results.map(resultToTrack), idx)
  }

  return (
    <>
      <PageHeader
        title={display}
        subtitle={
          <span className="flex items-center gap-2">
            <Tv size={12} />
            twitch channel
            {live && (
              <span className="flex items-center gap-1.5 text-app-accent">
                · <span className="w-1.5 h-1.5 rounded-full bg-app-accent" /> live now
              </span>
            )}
          </span>
        }
      >
        <button
          onClick={() => setReload((n) => n + 1)}
          disabled={current.state === 'loading' || !onlineReady}
          title="Refresh"
          className="flex items-center gap-1.5 text-xs font-mono text-app-secondary hover:text-app-text disabled:opacity-40 transition-colors"
        >
          <RefreshCw size={12} />
          refresh
        </button>
      </PageHeader>

      {!onlineReady ? (
        <Status>yt-dlp isn't installed: open Explore to set it up.</Status>
      ) : current.state === 'loading' ? (
        <Status>
          <Loader2 size={14} className="animate-spin text-app-accent" />
          listing {display}'s vods...
        </Status>
      ) : current.state === 'error' ? (
        <Status>
          <AlertCircle size={14} className="shrink-0" />
          <span className="wrap-break-word">{current.error}</span>
        </Status>
      ) : results.length === 0 ? (
        <Status>no vods found for {display}.</Status>
      ) : (
        <div className="flex flex-col mt-2">
          {results.map((r) => (
            <ResultRow key={r.video_id} result={r} onPlay={() => handlePlay(r)} />
          ))}
        </div>
      )}
    </>
  )
}

function Status({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-6 py-3 text-xs font-mono text-app-muted">
      {children}
    </div>
  )
}
