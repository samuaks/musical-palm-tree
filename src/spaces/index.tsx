import { Globe, Home } from 'lucide-react'
import { JSX, ReactNode } from 'react'
import { LocalSpace } from './LocalSpace'
import { OnlineSpace } from './OnlineSpace'

export interface Space {
  id: string
  name: string
  icon: ReactNode
  Component: () => JSX.Element
}

export const SPACES: Space[] = [
  {
    id: 'local',
    name: 'Local',
    icon: <Home size={20} />,
    Component: LocalSpace,
  },
  {
    id: 'online',
    name: 'Online',
    icon: <Globe size={20} />,
    Component: OnlineSpace,
  },
]
