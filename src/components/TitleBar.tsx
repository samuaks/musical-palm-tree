import { getCurrentWindow } from '@tauri-apps/api/window'
import { Minus, Square, X } from 'lucide-react'

const win = getCurrentWindow()

export function Titlebar() {
  return (
    <div
      data-tauri-drag-region
      className="h-8 flex items-stretch justify-between border-b border-app-border select-none shrink-0"
    >
      <div
        data-tauri-drag-region
        className="flex items-center gap-2 px-3 font-medium font-mono text-app-accent"
      >
        <div className="w-3 h-3 rounded-full border border-app-accent flex items-center justify-center">
          <div className="w-0.5 h-0.5 rounded-full bg-app-accent" />
        </div>
        playmusic
      </div>

      <div className="flex items-stretch">
        <button
          onClick={() => win.minimize()}
          className="px-4 hover:bg-app-hover transition-colors text-app-muted hover:text-app-text flex items-center justify-center"
        >
          <Minus size={12} />
        </button>
        <button
          onClick={() => win.toggleMaximize()}
          className="px-4 hover:bg-app-hover transition-colors text-app-muted hover:text-app-text flex items-center justify-center"
        >
          <Square size={10} />
        </button>
        <button
          onClick={() => win.close()}
          className="px-4 hover:bg-red-500 hover:text-white transition-colors text-app-muted flex items-center justify-center"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  )
}
