import { SPACES } from '../spaces'
import { useAppStore } from '../store'

export function SpaceSidebar() {
  const activeSpaceId = useAppStore((s) => s.activeSpaceId)
  const setActiveSpaceId = useAppStore((s) => s.setActiveSpaceId)

  return (
    <div className="w-14 shrink-0 flex flex-col items-center gap-2 py-3 border-r border-app-border">
      {SPACES.map((space) => {
        const isActive = activeSpaceId === space.id
        return (
          <button
            key={space.id}
            onClick={() => setActiveSpaceId(space.id)}
            title={space.name}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
              isActive
                ? 'bg-app-accent text-app-accent-text'
                : 'text-app-secondary hover:bg-app-hover hover:text-app-text'
            }`}
          >
            {space.icon}
          </button>
        )
      })}
    </div>
  )
}
