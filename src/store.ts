import { create } from 'zustand'
import {
  Directory,
  ScanMetaData,
  ScanState,
  Track,
  OnlineSearchResult,
  OnlineSearchState,
} from './types'

type Theme = 'dark' | 'light'

const COLLAPSED_KEY = 'playmusic-collapsed'

interface LocalSpaceState {
  // scan state
  dirs: Directory[]
  scanMeta: ScanMetaData | null
  scanState: ScanState
  liveCount: number

  // ui state
  query: string
  durations: Record<string, number>

  // collapsed albums
  collapsed: Set<string>
}

interface OnlineSpaceState {
  query: string
  results: OnlineSearchResult[]
  searchState: OnlineSearchState
  searchError: string | null
}

interface AppState {
  activeSpaceId: string

  spaces: {
    local: LocalSpaceState
    online: OnlineSpaceState
  }

  // playback state (queue is the single source of truth)
  queue: Track[]
  queueIndex: number // -1 when nothing has been played yet
  playing: boolean
  resolving: boolean

  // theme
  theme: Theme

  // actions
  setActiveSpaceId: (id: string) => void
  setPlaying: (playing: boolean) => void
  setResolving: (resolving: boolean) => void
  setTheme: (theme: Theme) => void

  // queue actions
  playTrackFromList: (tracks: Track[], index: number) => void
  playNext: () => void
  playPrev: () => void
  clearQueue: () => void

  // local space actions
  setLocalDirs: (dirs: Directory[]) => void
  setLocalScanMeta: (meta: ScanMetaData | null) => void
  setLocalScanState: (state: ScanState) => void
  setLocalLiveCount: (count: number) => void
  setLocalQuery: (query: string) => void
  setLocalDuration: (path: string, duration: number) => void
  toggleLocalCollapsed: (key: string) => void

  // online space actions
  setOnlineQuery: (query: string) => void
  setOnlineResults: (results: OnlineSearchResult[]) => void
  setOnlineSearchState: (state: OnlineSearchState) => void
  setOnlineSearchError: (error: string | null) => void
  resetOnlineSearch: () => void
}

export const useAppStore = create<AppState>((set) => ({
  activeSpaceId: 'local',
  queue: [],
  queueIndex: -1,
  playing: false,
  resolving: false,
  theme:
    (typeof window !== 'undefined' && (localStorage.getItem('playmusic-theme') as Theme)) || 'dark',

  spaces: {
    local: {
      dirs: [],
      scanMeta: null,
      scanState: 'idle',
      liveCount: 0,
      query: '',
      durations: {},
      collapsed: loadCollapsed(),
    },
    online: {
      query: '',
      results: [],
      searchState: 'idle',
      searchError: null,
    },
  },

  setActiveSpaceId: (id) => set({ activeSpaceId: id }),
  setPlaying: (playing) => set({ playing }),
  setResolving: (resolving) => set({ resolving }),
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

  setLocalDirs: (dirs) =>
    set((s) => ({ spaces: { ...s.spaces, local: { ...s.spaces.local, dirs } } })),
  setLocalScanMeta: (scanMeta) =>
    set((s) => ({ spaces: { ...s.spaces, local: { ...s.spaces.local, scanMeta } } })),
  setLocalScanState: (scanState) =>
    set((s) => ({ spaces: { ...s.spaces, local: { ...s.spaces.local, scanState } } })),
  setLocalLiveCount: (liveCount) =>
    set((s) => ({ spaces: { ...s.spaces, local: { ...s.spaces.local, liveCount } } })),
  setLocalQuery: (query) =>
    set((s) => ({ spaces: { ...s.spaces, local: { ...s.spaces.local, query } } })),
  setLocalDuration: (path, duration) =>
    set((s) => ({
      spaces: {
        ...s.spaces,
        local: {
          ...s.spaces.local,
          durations: { ...s.spaces.local.durations, [path]: duration },
        },
      },
    })),
  toggleLocalCollapsed: (key) =>
    set((s) => {
      const next = new Set(s.spaces.local.collapsed)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]))
      return {
        spaces: { ...s.spaces, local: { ...s.spaces.local, collapsed: next } },
      }
    }),

  setOnlineQuery: (query) =>
    set((s) => ({ spaces: { ...s.spaces, online: { ...s.spaces.online, query } } })),
  setOnlineResults: (results) =>
    set((s) => ({ spaces: { ...s.spaces, online: { ...s.spaces.online, results } } })),
  setOnlineSearchState: (searchState) =>
    set((s) => ({ spaces: { ...s.spaces, online: { ...s.spaces.online, searchState } } })),
  setOnlineSearchError: (searchError) =>
    set((s) => ({ spaces: { ...s.spaces, online: { ...s.spaces.online, searchError } } })),
  resetOnlineSearch: () =>
    set((s) => ({
      spaces: {
        ...s.spaces,
        online: {
          ...s.spaces.online,
          query: '',
          results: [],
          searchState: 'idle',
          searchError: null,
        },
      },
    })),
}))

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
}

export const selectCurrentTrack = (s: ReturnType<typeof useAppStore.getState>): Track | null => {
  if (s.queueIndex < 0 || s.queueIndex >= s.queue.length) return null
  return s.queue[s.queueIndex]
}
