import { create } from 'zustand'
import { Directory, MediaFile, ScanMetaData, ScanState } from './types'

type Theme = 'dark' | 'light'

const STORAGE_KEY = 'playmusic-collapsed'

function loadCollapsed(): Set<string> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return new Set()
    const parsed = JSON.parse(saved)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed)
  } catch {
    return new Set()
  }
}
interface AppState {
  // scan state
  dirs: Directory[]
  scanMeta: ScanMetaData | null
  scanState: ScanState
  liveCount: number

  // playback state
  currentTrack: MediaFile | null
  playing: boolean

  // ui state
  query: string
  durations: Record<string, number>

  // theme
  theme: Theme

  //collapsed albums
  collapsed: Set<string>

  // actions
  setDirs: (dirs: Directory[]) => void
  setScanMeta: (meta: ScanMetaData | null) => void
  setScanState: (state: ScanState) => void
  setLiveCount: (count: number) => void
  setCurrentTrack: (track: MediaFile | null) => void
  setPlaying: (playing: boolean) => void
  setQuery: (query: string) => void
  setDuration: (path: string, duration: number) => void
  setTheme: (theme: Theme) => void
  toggleCollapsed: (key: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  dirs: [],
  scanMeta: null,
  scanState: 'idle',
  liveCount: 0,
  currentTrack: null,
  playing: false,
  query: '',
  durations: {},
  theme:
    (typeof window !== 'undefined' && (localStorage.getItem('playmusic-theme') as Theme)) || 'dark',
  collapsed: loadCollapsed(),

  setDirs: (dirs) => set({ dirs }),
  setScanMeta: (scanMeta) => set({ scanMeta }),
  setScanState: (scanState) => set({ scanState }),
  setLiveCount: (liveCount) => set({ liveCount }),
  setCurrentTrack: (currentTrack) => set({ currentTrack }),
  setPlaying: (playing) => set({ playing }),
  setQuery: (query) => set({ query }),
  setDuration: (path, duration) =>
    set((state) => ({ durations: { ...state.durations, [path]: duration } })),
  setTheme: (theme) => {
    localStorage.setItem('playmusic-theme', theme)
    document.documentElement.dataset.theme = theme
    set({ theme })
  },
  toggleCollapsed: (key) =>
    set((state) => {
      const next = new Set(state.collapsed)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
      return { collapsed: next }
    }),
}))

if (typeof window !== 'undefined') {
  const initial = (localStorage.getItem('playmusic-theme') as Theme) || 'dark'
  document.documentElement.dataset.theme = initial
}
