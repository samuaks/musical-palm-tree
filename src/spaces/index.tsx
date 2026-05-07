import { Globe, Home } from 'lucide-react'
import { JSX, ReactNode } from 'react'
import { LocalSpace } from './LocalSpace'
import { OnlineSpace } from './OnlineSpace'
import { LocalSpaceHeader } from './LocalSpaceHeader'
import { OnlineSpaceHeader } from './OnlineSpaceHeader'

export interface Space {
  id: string
  name: string
  icon: ReactNode
  Component: () => JSX.Element
  Header: () => JSX.Element
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
  },
]
