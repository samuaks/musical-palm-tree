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
  HistoryEntry,
} from './types'

type Theme = 'dark' | 'light'

const COLLAPSED_KEY = 'playmusic-collapsed'
const ONLINE_PLATFORM_KEY = 'playmusic-online-platform'
const HISTORY_KEY = 'playmusic-history'
const HISTORY_COLLAPSED_KEY = 'playmusic-history-collapsed'
/** Oldest entries drop off past this. */
export const HISTORY_LIMIT = 50
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
  history: HistoryEntry[] // watched online items, most recent first (persisted)
  historyCollapsed: boolean // the HISTORY section is folded (persisted)
  // streams that couldn't be resolved the last time they were played (a live channel that's
  // offline), keyed by streamKey(platform, videoId)
  failedStreams: Set<string>
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
  addToHistory: (entry: HistoryEntry) => void
  removeFromHistory: (platform: Platform, videoId: string) => void
  clearHistory: () => void
  toggleHistoryCollapsed: () => void
  setStreamFailed: (platform: Platform, videoId: string, failed: boolean) => void
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
      video: true,
      downloads: {},
      history: loadHistory(),
      historyCollapsed:
        typeof window !== 'undefined' && localStorage.getItem(HISTORY_COLLAPSED_KEY) === 'true',
      failedStreams: new Set(),
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

    // Watching something again moves it to the top.
    addToHistory: (entry) =>
      setOnline((s) => {
        const rest = s.online.history.filter(
          (e) => e.platform !== entry.platform || e.video_id !== entry.video_id
        )
        return { history: saveHistory([entry, ...rest].slice(0, HISTORY_LIMIT)) }
      }),
    removeFromHistory: (platform, videoId) =>
      setOnline((s) => ({
        history: saveHistory(
          s.online.history.filter((e) => e.platform !== platform || e.video_id !== videoId)
        ),
      })),
    clearHistory: () => setOnline(() => ({ history: saveHistory([]) })),
    toggleHistoryCollapsed: () =>
      setOnline((s) => {
        const historyCollapsed = !s.online.historyCollapsed
        localStorage.setItem(HISTORY_COLLAPSED_KEY, String(historyCollapsed))
        return { historyCollapsed }
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
  }
})

/** Store key for one online stream, for `online.failedStreams`. */
export function streamKey(platform: Platform, videoId: string): string {
  return `${platform}:${videoId}`
}

function saveHistory(history: HistoryEntry[]): HistoryEntry[] {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
  return history
}

function loadHistory(): HistoryEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (e): e is HistoryEntry =>
        (e?.platform === 'youtube' || e?.platform === 'twitch') &&
        typeof e.video_id === 'string' &&
        typeof e.title === 'string'
    )
  } catch {
    return []
  }
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
}

export const selectCurrentTrack = (s: ReturnType<typeof useAppStore.getState>): Track | null => {
  if (s.queueIndex < 0 || s.queueIndex >= s.queue.length) return null
  return s.queue[s.queueIndex]
}

function loadOnlinePlatform(): Platform {
  if (typeof window === 'undefined') return 'youtube'
  return localStorage.getItem(ONLINE_PLATFORM_KEY) === 'twitch' ? 'twitch' : 'youtube'
}
