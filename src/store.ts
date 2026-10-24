import { create } from 'zustand'
import {
  Directory,
  ScanMetaData,
  ScanState,
  Track,
  OnlineSearchResult,
  OnlineSearchState,
  YtDlpStatus,
  DownloadStatus,
  Platform,
  LocalPlay,
  OnlinePlay,
  PlayEntry,
} from './types'
import {
  isChannelName,
  migrateHistory,
  playKey,
  streamKey,
  validPlays,
  withPlay,
} from './utils/plays'

export { streamKey }

type Theme = 'dark' | 'light'

/** A page of the main view, picked in the sidebar. A non-empty search box shows results instead. */
export type View =
  | { page: 'home' }
  | { page: 'explore' }
  | { page: 'library' }
  | { page: 'recent' }
  | { page: 'most' }
  | { page: 'folder'; path: string }
  | { page: 'channel'; name: string } // a Twitch channel (login name): its live stream and VODs

const VIEW_KEY = 'playmusic-view'
/** How far back ‹ can go. */
const NAV_HISTORY_LIMIT = 50
const COLLAPSED_KEY = 'playmusic-collapsed'
const ONLINE_PLATFORM_KEY = 'playmusic-online-platform'
const PLAYS_KEY = 'playmusic-plays'
const RECENT_COLLAPSED_KEY = 'playmusic-recent-collapsed'
/** The online-only watch history, migrated into the play log once; cleared at startup. */
const LEGACY_HISTORY_KEY = 'playmusic-history'
const LEGACY_HISTORY_COLLAPSED_KEY = 'playmusic-history-collapsed'
/** From when the app had separate Local/Online spaces; cleared at startup. */
const LEGACY_ACTIVE_SPACE_KEY = 'playmusic-active-space'
/** From when audio-only was a saved setting instead of per track; cleared at startup. */
const LEGACY_ONLINE_VIDEO_KEY = 'playmusic-online-video'

interface LibraryState {
  // scan state
  dirs: Directory[]
  scanMeta: ScanMetaData | null
  scanState: ScanState
  liveCount: number

  durations: Record<string, number>

  // collapsed albums
  collapsed: Set<string>
}

interface OnlineState {
  platform: Platform // the ONLINE tab Enter searches (persisted)
  results: OnlineSearchResult[]
  searchedQuery: string | null // the query `results` belong to
  searchState: OnlineSearchState
  searchError: string | null
  video: boolean // play the current online track with picture (back on for every new track)
  downloads: Record<string, DownloadStatus> // keyed by downloadKey(platform, videoId, kind)
  liveChannels: Set<string> // Twitch channels (login names) found live by the last check
  // streams that couldn't be resolved the last time they were played (a live channel that's
  // offline), keyed by streamKey(platform, videoId)
  failedStreams: Set<string>
}

interface NavState {
  view: View // the page shown (persisted)
  back: View[] // pages ‹ returns to, most recent last
  forward: View[] // pages › goes to after going back
}

interface AppState {
  // one search box: filters the library as you type, searches online (YouTube/Twitch) on Enter
  query: string

  nav: NavState

  // what was played for 30 s (local and online), most recent first (persisted)
  plays: PlayEntry[]
  recentCollapsed: boolean // the RECENTLY PLAYED section is folded (persisted)

  library: LibraryState
  online: OnlineState

  // playback state (queue is the single source of truth)
  queue: Track[]
  queueIndex: number // -1 when nothing has been played yet
  playing: boolean
  resolving: boolean
  videoActive: boolean // the current track is showing a picture in the video pane

  // null until checked at startup
  ytDlp: YtDlpStatus | null

  // theme
  theme: Theme

  // actions
  setQuery: (query: string) => void
  setPlaying: (playing: boolean) => void
  setResolving: (resolving: boolean) => void
  setVideoActive: (videoActive: boolean) => void
  setYtDlp: (status: YtDlpStatus) => void
  setTheme: (theme: Theme) => void

  // navigation: opening a page clears the search box, so the page shows instead of results
  navigate: (view: View) => void
  goBack: () => void
  goForward: () => void

  // play log actions
  recordPlay: (ref: LocalPlay | OnlinePlay) => void
  removePlay: (key: string) => void
  clearPlays: () => void
  toggleRecentCollapsed: () => void

  // queue actions
  playTrackFromList: (tracks: Track[], index: number) => void
  playNext: () => void
  playPrev: () => void
  clearQueue: () => void

  // library actions
  setLibraryDirs: (dirs: Directory[]) => void
  setLibraryScanMeta: (meta: ScanMetaData | null) => void
  setLibraryScanState: (state: ScanState) => void
  setLibraryLiveCount: (count: number) => void
  setLibraryDuration: (path: string, duration: number) => void
  toggleLibraryCollapsed: (key: string) => void

  // online actions
  setOnlineResults: (query: string, results: OnlineSearchResult[]) => void
  setOnlineSearchState: (state: OnlineSearchState) => void
  setOnlineSearchError: (error: string | null) => void
  clearOnlineSearch: () => void
  setOnlineVideo: (video: boolean) => void
  setOnlinePlatform: (platform: Platform) => void
  setDownload: (key: string, status: DownloadStatus) => void
  setDownloadPercent: (key: string, percent: number | null) => void
  setStreamFailed: (platform: Platform, videoId: string, failed: boolean) => void
  setLiveChannels: (names: string[]) => void
}

export const useAppStore = create<AppState>((set) => {
  const setLibrary = (patch: (s: AppState) => Partial<LibraryState>) =>
    set((s) => ({ library: { ...s.library, ...patch(s) } }))
  const setOnline = (patch: (s: AppState) => Partial<OnlineState>) =>
    set((s) => ({ online: { ...s.online, ...patch(s) } }))

  return {
    query: '',
    nav: { view: loadView(), back: [], forward: [] },
    plays: loadPlays(),
    recentCollapsed: loadRecentCollapsed(),
    queue: [],
    queueIndex: -1,
    playing: false,
    resolving: false,
    videoActive: false,
    ytDlp: null,
    theme:
      (typeof window !== 'undefined' && (localStorage.getItem('playmusic-theme') as Theme)) ||
      'dark',

    library: {
      dirs: [],
      scanMeta: null,
      scanState: 'idle',
      liveCount: 0,
      durations: {},
      collapsed: loadCollapsed(),
    },
    online: {
      platform: loadOnlinePlatform(),
      results: [],
      searchedQuery: null,
      searchState: 'idle',
      searchError: null,
      video: true,
      downloads: {},
      failedStreams: new Set(),
      liveChannels: new Set(),
    },

    setQuery: (query) => set({ query }),
    setPlaying: (playing) => set({ playing }),
    setResolving: (resolving) => set({ resolving }),
    setVideoActive: (videoActive) => set({ videoActive }),
    setYtDlp: (ytDlp) => set({ ytDlp }),
    setTheme: (theme) => {
      localStorage.setItem('playmusic-theme', theme)
      document.documentElement.dataset.theme = theme
      set({ theme })
    },

    navigate: (view) =>
      set((s) => {
        if (sameView(view, s.nav.view)) return s.query ? { query: '' } : s
        saveView(view)
        return {
          query: '',
          nav: {
            view,
            back: [...s.nav.back, s.nav.view].slice(-NAV_HISTORY_LIMIT),
            forward: [],
          },
        }
      }),
    goBack: () =>
      set((s) => {
        const view = s.nav.back[s.nav.back.length - 1]
        if (!view) return s
        saveView(view)
        return {
          query: '',
          nav: { view, back: s.nav.back.slice(0, -1), forward: [...s.nav.forward, s.nav.view] },
        }
      }),
    goForward: () =>
      set((s) => {
        const view = s.nav.forward[s.nav.forward.length - 1]
        if (!view) return s
        saveView(view)
        return {
          query: '',
          nav: { view, back: [...s.nav.back, s.nav.view], forward: s.nav.forward.slice(0, -1) },
        }
      }),

    // Playing something again moves it to the top.
    recordPlay: (ref) => set((s) => ({ plays: savePlays(withPlay(s.plays, ref, Date.now())) })),
    removePlay: (key) =>
      set((s) => ({ plays: savePlays(s.plays.filter((e) => playKey(e) !== key)) })),
    clearPlays: () => set({ plays: savePlays([]) }),
    toggleRecentCollapsed: () =>
      set((s) => {
        localStorage.setItem(RECENT_COLLAPSED_KEY, String(!s.recentCollapsed))
        return { recentCollapsed: !s.recentCollapsed }
      }),

    playTrackFromList: (tracks, index) => {
      if (tracks.length === 0 || index < 0 || index >= tracks.length) return
      set((s) => ({ queue: tracks, queueIndex: index, online: { ...s.online, video: true } }))
    },

    // Audio-only applies to one track: YouTube and Twitch have video, so the next one shows it.
    playNext: () =>
      set((s) => {
        if (s.queueIndex < 0 || s.queueIndex >= s.queue.length - 1) return s
        return { queueIndex: s.queueIndex + 1, online: { ...s.online, video: true } }
      }),

    playPrev: () =>
      set((s) => {
        if (s.queueIndex <= 0) return s
        return { queueIndex: s.queueIndex - 1, online: { ...s.online, video: true } }
      }),

    clearQueue: () => set({ queue: [], queueIndex: -1 }),

    setLibraryDirs: (dirs) => setLibrary(() => ({ dirs })),
    setLibraryScanMeta: (scanMeta) => setLibrary(() => ({ scanMeta })),
    setLibraryScanState: (scanState) => setLibrary(() => ({ scanState })),
    setLibraryLiveCount: (liveCount) => setLibrary(() => ({ liveCount })),
    setLibraryDuration: (path, duration) =>
      setLibrary((s) => ({ durations: { ...s.library.durations, [path]: duration } })),
    toggleLibraryCollapsed: (key) =>
      setLibrary((s) => {
        const collapsed = new Set(s.library.collapsed)
        if (collapsed.has(key)) collapsed.delete(key)
        else collapsed.add(key)
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]))
        return { collapsed }
      }),

    setOnlineResults: (searchedQuery, results) => setOnline(() => ({ searchedQuery, results })),
    setOnlineSearchState: (searchState) => setOnline(() => ({ searchState })),
    setOnlineSearchError: (searchError) => setOnline(() => ({ searchError })),
    clearOnlineSearch: () =>
      setOnline(() => ({
        results: [],
        searchedQuery: null,
        searchState: 'idle',
        searchError: null,
      })),
    setOnlineVideo: (video) => setOnline(() => ({ video })),
    // Results belong to one platform, so switching tabs drops them.
    setOnlinePlatform: (platform) => {
      localStorage.setItem(ONLINE_PLATFORM_KEY, platform)
      setOnline(() => ({
        platform,
        results: [],
        searchedQuery: null,
        searchState: 'idle',
        searchError: null,
      }))
    },
    setDownload: (key, status) =>
      setOnline((s) => ({ downloads: { ...s.online.downloads, [key]: status } })),
    setDownloadPercent: (key, percent) =>
      setOnline((s) => {
        const current = s.online.downloads[key]
        if (current?.state !== 'downloading') return {}
        return { downloads: { ...s.online.downloads, [key]: { ...current, percent } } }
      }),

    setStreamFailed: (platform, videoId, failed) =>
      setOnline((s) => {
        const key = streamKey(platform, videoId)
        if (s.online.failedStreams.has(key) === failed) return {}
        const failedStreams = new Set(s.online.failedStreams)
        if (failed) failedStreams.add(key)
        else failedStreams.delete(key)
        return { failedStreams }
      }),
    setLiveChannels: (names) => setOnline(() => ({ liveChannels: new Set(names) })),
  }
})

function sameView(a: View, b: View): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function saveView(view: View) {
  localStorage.setItem(VIEW_KEY, JSON.stringify(view))
}

function loadView(): View {
  const home: View = { page: 'home' }
  if (typeof window === 'undefined') return home
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? 'null')
    if (v?.page === 'channel')
      return typeof v.name === 'string' && isChannelName(v.name)
        ? { page: 'channel', name: v.name }
        : home
    if (v?.page === 'folder')
      return typeof v.path === 'string' ? { page: 'folder', path: v.path } : home
    if (['home', 'explore', 'library', 'recent', 'most'].includes(v?.page)) return { page: v.page }
    return home
  } catch {
    return home
  }
}

function savePlays(plays: PlayEntry[]): PlayEntry[] {
  localStorage.setItem(PLAYS_KEY, JSON.stringify(plays))
  return plays
}

/** The play log, or, the first time, the old watch history turned into one. */
function loadPlays(): PlayEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const saved = localStorage.getItem(PLAYS_KEY)
    if (saved !== null) return validPlays(JSON.parse(saved))
    const legacy = localStorage.getItem(LEGACY_HISTORY_KEY)
    return legacy === null ? [] : savePlays(migrateHistory(JSON.parse(legacy)))
  } catch {
    return []
  }
}

function loadRecentCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  let saved = localStorage.getItem(RECENT_COLLAPSED_KEY)
  if (saved === null) {
    saved = localStorage.getItem(LEGACY_HISTORY_COLLAPSED_KEY)
    if (saved !== null) localStorage.setItem(RECENT_COLLAPSED_KEY, saved)
  }
  return saved === 'true'
}

function loadCollapsed(): Set<string> {
  try {
    const saved = localStorage.getItem(COLLAPSED_KEY)
    if (!saved) return new Set()
    const parsed = JSON.parse(saved)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed)
  } catch {
    return new Set()
  }
}

if (typeof window !== 'undefined') {
  const initial = (localStorage.getItem('playmusic-theme') as Theme) || 'dark'
  document.documentElement.dataset.theme = initial
  localStorage.removeItem(LEGACY_ACTIVE_SPACE_KEY)
  localStorage.removeItem(LEGACY_ONLINE_VIDEO_KEY)
  // the store above has loaded (and migrated) them by now
  localStorage.removeItem(LEGACY_HISTORY_KEY)
  localStorage.removeItem(LEGACY_HISTORY_COLLAPSED_KEY)
}

export const selectCurrentTrack = (s: ReturnType<typeof useAppStore.getState>): Track | null => {
  if (s.queueIndex < 0 || s.queueIndex >= s.queue.length) return null
  return s.queue[s.queueIndex]
}

function loadOnlinePlatform(): Platform {
  if (typeof window === 'undefined') return 'youtube'
  return localStorage.getItem(ONLINE_PLATFORM_KEY) === 'twitch' ? 'twitch' : 'youtube'
}
