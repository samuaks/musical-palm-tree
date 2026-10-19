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
  requiresOnline?: boolean // needs yt-dlp; hidden only where the app can't install it
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

/**
 * Spaces that can be shown. Online ones stay visible while yt-dlp is missing, since the app
 * can install it, except on platforms with no yt-dlp build to download.
 */
export function useSpaces(): Space[] {
  const ytDlp = useAppStore((s) => s.ytDlp)
  const hideOnline = ytDlp !== null && !ytDlp.available && !ytDlp.can_install
  return SPACES.filter((space) => !space.requiresOnline || !hideOnline)
}
