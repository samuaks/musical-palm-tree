import { Globe, Home } from 'lucide-react'
import { JSX, ReactNode } from 'react'
import { LocalSpace } from './LocalSpace'
import { OnlineSpace } from './OnlineSpace'
import { LocalSpaceHeader } from './LocalSpaceHeader'
import { OnlineSpaceHeader } from './OnlineSpaceHeader'
import { useAppStore } from '../store'

export interface Space {
  id: string
  name: string
  icon: ReactNode
  Component: () => JSX.Element
  Header: () => JSX.Element
  requiresOnline?: boolean // hidden when yt-dlp isn't installed
}

export const SPACES: Space[] = [
  {
    id: 'local',
    name: 'Local',
    icon: <Home size={20} />,
    Component: LocalSpace,
    Header: LocalSpaceHeader,
  },
  {
    id: 'online',
    name: 'Online',
    icon: <Globe size={20} />,
    Component: OnlineSpace,
    Header: OnlineSpaceHeader,
    requiresOnline: true,
  },
]

/** Spaces that can be shown. Online ones stay visible until the yt-dlp check says otherwise. */
export function useSpaces(): Space[] {
  const onlineAvailable = useAppStore((s) => s.onlineAvailable)
  return SPACES.filter((space) => !space.requiresOnline || onlineAvailable !== false)
}
