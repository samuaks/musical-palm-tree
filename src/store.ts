import { create } from 'zustand'
import { Directory, MediaFile, ScanMetaData, ScanState } from './types'

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

  // actions
  setDirs: (dirs: Directory[]) => void
  setScanMeta: (meta: ScanMetaData | null) => void
  setScanState: (state: ScanState) => void
  setLiveCount: (count: number) => void
  setCurrentTrack: (track: MediaFile | null) => void
  setPlaying: (playing: boolean) => void
  setQuery: (query: string) => void
  setDuration: (path: string, duration: number) => void
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

  setDirs: (dirs) => set({ dirs }),
  setScanMeta: (scanMeta) => set({ scanMeta }),
  setScanState: (scanState) => set({ scanState }),
  setLiveCount: (liveCount) => set({ liveCount }),
  setCurrentTrack: (currentTrack) => set({ currentTrack }),
  setPlaying: (playing) => set({ playing }),
  setQuery: (query) => set({ query }),
  setDuration: (path, duration) =>
    set((state) => ({ durations: { ...state.durations, [path]: duration } })),
}))