import { useMemo } from 'react'
import { useAppStore } from '../../store'
import { MediaFile } from '../../types'
import { MostListenedList, MostListenedTiles, RecentlyPlayed } from '../PlayLog'
import { Library, SectionHeader } from '../Library'
import { OnlineSection } from '../OnlineSection'
import { Track } from '../Track'
import { PageHeader } from './PageHeader'
import { ChannelPage } from './ChannelPage'
import { Eye, Tv } from 'lucide-react'
import { useHiddenChannels, useTwitchChannels } from '../../hooks/useTwitchChannels'
import { LiveNow } from '../LiveNow'

/** How many of the newest library files Home lists. */
const RECENTLY_ADDED = 8

/** The page for the current `nav.view`; a non-empty search box shows results instead. */
export function CurrentPage() {
  const view = useAppStore((s) => s.nav.view)
  const searching = useAppStore((s) => s.query.trim() !== '')

  if (searching) return <SearchPage />
  switch (view.page) {
    case 'home':
      return <HomePage />
    case 'explore':
      return <ExplorePage />
    case 'library':
      return <LibraryPage />
    case 'recent':
      return <RecentPage />
    case 'most':
      return <MostPage />
    case 'folder':
      return <FolderPage path={view.path} />
    case 'channel':
      // keyed: each channel starts fresh (its own refresh count and listing)
      return <ChannelPage key={view.name} name={view.name} />
  }
}

/** What the search box matches: recently played, the library, and online on Enter. */
function SearchPage() {
  return (
    <>
      <RecentlyPlayed />
      <Library />
      <OnlineSection />
    </>
  )
}

function HomePage() {
  return (
    <>
      <PageHeader
        title="Your music, on repeat."
        subtitle="Your files and what you watched, all in one place."
      />
      <LiveNow />
      <MostListenedTiles />
      <RecentlyPlayed limit={5} />
      <RecentlyAdded />
    </>
  )
}

/** The newest files in the library, by when they were added. */
function RecentlyAdded() {
  const dirs = useAppStore((s) => s.library.dirs)
  const newest = useMemo(() => {
    const all: { file: MediaFile; dirName: string; albumName: string | null }[] = dirs.flatMap(
      (dir) => [
        ...dir.files.map((file) => ({ file, dirName: dir.name, albumName: null })),
        ...dir.albums.flatMap((album) =>
          album.files.map((file) => ({ file, dirName: dir.name, albumName: album.name }))
        ),
      ]
    )
    return all.sort((a, b) => b.file.created_at - a.file.created_at).slice(0, RECENTLY_ADDED)
  }, [dirs])

  if (newest.length === 0) return null
  return (
    <div className="mb-2">
      <SectionHeader name="recently added" />
      {newest.map(({ file, dirName, albumName }) => (
        <Track key={file.path} file={file} dirName={dirName} albumName={albumName} />
      ))}
    </div>
  )
}

function ExplorePage() {
  return (
    <>
      <PageHeader title="Explore" subtitle="YouTube videos and Twitch channels, through yt-dlp." />
      <YourChannels />
      <OnlineSection page />
    </>
  )
}

/**
 * The Twitch channels you watch, as chips that open their pages (a dot while live), and the ones
 * you hid, to bring back.
 */
function YourChannels() {
  const channels = useTwitchChannels()
  const hidden = useHiddenChannels()
  const liveStreams = useAppStore((s) => s.online.liveStreams)
  const navigate = useAppStore((s) => s.navigate)
  const unhideChannel = useAppStore((s) => s.unhideChannel)
  if (channels.length === 0 && hidden.length === 0) return null

  return (
    <div className="mb-2">
      <SectionHeader name="your twitch channels" />
      <div className="flex flex-wrap gap-2 px-6">
        {channels.map((c) => (
          <button
            key={c.name}
            onClick={() => navigate({ page: 'channel', name: c.name })}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-app-border bg-app-surface text-xs font-mono text-app-secondary hover:border-app-accent hover:text-app-text transition-colors"
          >
            <Tv size={12} />
            {c.display}
            {liveStreams.has(c.name) && (
              <span className="flex items-center gap-1 text-[10px] text-app-accent tracking-wider uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-app-accent" />
                live
              </span>
            )}
          </button>
        ))}
      </div>
      {hidden.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-6 mt-3">
          <span className="text-[10px] font-mono text-app-muted tracking-widest uppercase">
            hidden
          </span>
          {hidden.map((c) => (
            <button
              key={c.name}
              onClick={() => unhideChannel(c.name)}
              title={`show ${c.display} again on Home and in the sidebar`}
              className="flex items-center gap-2 px-3 py-1 rounded-full border border-dashed border-app-border text-xs font-mono text-app-muted hover:border-app-accent hover:text-app-text transition-colors"
            >
              <Eye size={12} />
              {c.display}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function LibraryPage() {
  const meta = useAppStore((s) => s.library.scanMeta)
  const subtitle = meta
    ? [
        plural(meta.total_files, 'track'),
        plural(meta.total_albums, 'album'),
        plural(meta.total_directories, 'folder'),
        meta.total_duplicates > 0 && `${plural(meta.total_duplicates, 'duplicate')} hidden`,
        `scanned in ${meta.duration_ms} ms`,
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined

  return (
    <>
      <PageHeader title="Local library" subtitle={subtitle} />
      <Library />
    </>
  )
}

function RecentPage() {
  return (
    <>
      <PageHeader
        title="Recently played"
        subtitle="Your files, YouTube videos and Twitch streams, most recent first."
      />
      <RecentlyPlayed unfoldable />
    </>
  )
}

function MostPage() {
  return (
    <>
      <PageHeader title="Most listened" subtitle="What you played most in the last 30 days." />
      <MostListenedList />
    </>
  )
}

function FolderPage({ path }: { path: string }) {
  const dir = useAppStore((s) => s.library.dirs.find((d) => d.path === path))
  const scanning = useAppStore((s) => s.library.scanState !== 'done')

  return (
    <>
      <PageHeader title={dir?.name ?? 'Folder'} subtitle={path} />
      {dir ? (
        <Library only={[dir]} />
      ) : (
        <div className="px-6 py-3 text-xs text-app-muted font-mono">
          {scanning ? 'scanning...' : 'this folder is no longer in the library.'}
        </div>
      )}
    </>
  )
}

function plural(n: number, word: string): string {
  return `${n} ${n === 1 ? word : `${word}s`}`
}
