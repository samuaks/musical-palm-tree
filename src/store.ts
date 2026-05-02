import { create } from 'zustand'
import { Directory, MediaFile, ScanMetaData, ScanState } from './types'

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

  //collapsed albums
  collapsed: Set<string>
}

interface AppState {
  activeSpaceId: string

  spaces: {
    local: LocalSpaceState
  }

  // playback state
  currentTrack: MediaFile | null
  playing: boolean

  // theme
  theme: Theme

  // actions
  setActiveSpaceId: (id: string) => void
  setCurrentTrack: (track: MediaFile | null) => void
  setPlaying: (playing: boolean) => void
  setTheme: (theme: Theme) => void

  //local space actions
  setLocalDirs: (dirs: Directory[]) => void
  setLocalScanMeta: (meta: ScanMetaData | null) => void
  setLocalScanState: (state: ScanState) => void
  setLocalLiveCount: (count: number) => void
  setLocalQuery: (query: string) => void
  setLocalDuration: (path: string, duration: number) => void
  toggleLocalCollapsed: (key: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  activeSpaceId: 'local',
  currentTrack: null,
  playing: false,
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
  },

  setActiveSpaceId: (id) => set({ activeSpaceId: id }),
  setCurrentTrack: (currentTrack) => set({ currentTrack }),
  setPlaying: (playing) => set({ playing }),
  setTheme: (theme) => {
    localStorage.setItem('playmusic-theme', theme)
    document.documentElement.dataset.theme = theme
    set({ theme })
  },

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
