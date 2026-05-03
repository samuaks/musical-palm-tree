import { useAppStore } from '../store'

export function usePlayer() {
  const playNext = useAppStore((s) => s.playNext)
  const playPrev = useAppStore((s) => s.playPrev)
  return { next: playNext, prev: playPrev }
}
