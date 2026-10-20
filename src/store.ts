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
} from './types'

type Theme = 'dark' | 'light'

const COLLAPSED_KEY = 'playmusic-collapsed'
const ONLINE_VIDEO_KEY = 'playmusic-online-video'
const ONLINE_PLATFORM_KEY = 'playmusic-online-platform'
/** From when the app had separate Local/Online spaces; cleared at startup. */
const LEGACY_ACTIVE_SPACE_KEY = 'playmusic-active-space'

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
  video: boolean // play online tracks with picture (persisted)
  downloads: Record<string, DownloadStatus> // keyed by downloadKey(platform, videoId, kind)
}

interface AppState {
  // one search box: filters the library as you type, searches online (YouTube/Twitch) on Enter
  query: string

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
}

export const useAppStore = create<AppState>((set) => {
  const setLibrary = (patch: (s: AppState) => Partial<LibraryState>) =>
    set((s) => ({ library: { ...s.library, ...patch(s) } }))
  const setOnline = (patch: (s: AppState) => Partial<OnlineState>) =>
    set((s) => ({ online: { ...s.online, ...patch(s) } }))

  return {
    query: '',
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
      video: loadOnlineVideo(),
      downloads: {},
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
    playTrackFromList: (tracks, index) => {
      if (tracks.length === 0 || index < 0 || index >= tracks.length) return
      set({ queue: tracks, queueIndex: index })
    },

    playNext: () =>
      set((s) => {
        if (s.queueIndex < 0 || s.queueIndex >= s.queue.length - 1) return s
        return { queueIndex: s.queueIndex + 1 }
      }),

    playPrev: () =>
      set((s) => {
        if (s.queueIndex <= 0) return s
        return { queueIndex: s.queueIndex - 1 }
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
    setOnlineVideo: (video) => {
      localStorage.setItem(ONLINE_VIDEO_KEY, String(video))
      setOnline(() => ({ video }))
    },
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
  }
})

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
}

export const selectCurrentTrack = (s: ReturnType<typeof useAppStore.getState>): Track | null => {
  if (s.queueIndex < 0 || s.queueIndex >= s.queue.length) return null
  return s.queue[s.queueIndex]
}

function loadOnlinePlatform(): Platform {
  if (typeof window === 'undefined') return 'youtube'
  return localStorage.getItem(ONLINE_PLATFORM_KEY) === 'twitch' ? 'twitch' : 'youtube'
}

function loadOnlineVideo(): boolean {
  if (typeof window === 'undefined') return true
  return localStorage.getItem(ONLINE_VIDEO_KEY) !== 'false'
}
