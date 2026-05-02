import { Globe } from 'lucide-react'

export function OnlineSpace() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-app-muted">
        <Globe size={48} />
        <span className="text-sm font-mono">Online space — coming soon</span>
      </div>
    </div>
  )
}
