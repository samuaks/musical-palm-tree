import { useAppStore } from '../store'
import { SPACES } from '../spaces'
import { ThemeToggle } from './ThemeToggle'

export function Header() {
  const activeSpaceId = useAppStore((s) => s.activeSpaceId)
  const space = SPACES.find((s) => s.id === activeSpaceId)
  const SpaceHeader = space?.Header

  return (
    <div className="shrink-0 px-6 pt-5 pb-4 border-b border-app-border">
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">{SpaceHeader && <SpaceHeader />}</div>
        <div className="shrink-0 pt-0.5">
          <ThemeToggle />
        </div>
      </div>
    </div>
  )
}
