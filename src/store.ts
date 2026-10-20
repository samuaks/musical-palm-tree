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
} from './types'

type Theme = 'dark' | 'light'

const COLLAPSED_KEY = 'playmusic-collapsed'
const ONLINE_VIDEO_KEY = 'playmusic-online-video'
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

interface YouTubeState {
  results: OnlineSearchResult[]
  searchedQuery: string | null // the query `results` belong to
  searchState: OnlineSearchState
  searchError: string | null
  video: boolean // play online tracks with picture (persisted)
  downloads: Record<string, DownloadStatus> // keyed by downloadKey(videoId, kind)
}

interface AppState {
  // one search box: filters the library as you type, searches YouTube on Enter
  query: string

  library: LibraryState
  youtube: YouTubeState

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

  // youtube actions
  setYouTubeResults: (query: string, results: OnlineSearchResult[]) => void
  setYouTubeSearchState: (state: OnlineSearchState) => void
  setYouTubeSearchError: (error: string | null) => void
  clearYouTubeSearch: () => void
  setYouTubeVideo: (video: boolean) => void
  setDownload: (key: string, status: DownloadStatus) => void
  setDownloadPercent: (key: string, percent: number | null) => void
}

export const useAppStore = create<AppState>((set) => {
  const setLibrary = (patch: (s: AppState) => Partial<LibraryState>) =>
    set((s) => ({ library: { ...s.library, ...patch(s) } }))
  const setYouTube = (patch: (s: AppState) => Partial<YouTubeState>) =>
    set((s) => ({ youtube: { ...s.youtube, ...patch(s) } }))

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
    youtube: {
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

    setYouTubeResults: (searchedQuery, results) => setYouTube(() => ({ searchedQuery, results })),
    setYouTubeSearchState: (searchState) => setYouTube(() => ({ searchState })),
    setYouTubeSearchError: (searchError) => setYouTube(() => ({ searchError })),
    clearYouTubeSearch: () =>
      setYouTube(() => ({
        results: [],
        searchedQuery: null,
        searchState: 'idle',
        searchError: null,
      })),
    setYouTubeVideo: (video) => {
      localStorage.setItem(ONLINE_VIDEO_KEY, String(video))
      setYouTube(() => ({ video }))
    },
    setDownload: (key, status) =>
      setYouTube((s) => ({ downloads: { ...s.youtube.downloads, [key]: status } })),
    setDownloadPercent: (key, percent) =>
      setYouTube((s) => {
        const current = s.youtube.downloads[key]
        if (current?.state !== 'downloading') return {}
        return { downloads: { ...s.youtube.downloads, [key]: { ...current, percent } } }
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

function loadOnlineVideo(): boolean {
  if (typeof window === 'undefined') return true
  return localStorage.getItem(ONLINE_VIDEO_KEY) !== 'false'
}
