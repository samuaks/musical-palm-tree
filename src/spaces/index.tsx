import { Disc3 } from 'lucide-react'
import { JSX, ReactNode } from 'react'

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
    icon: <Disc3 />,
    Component: LocalSpace,
  },
]
