import { ReactNode, useEffect, useRef } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { ChevronLeft, ChevronRight, Minus, Search, Square, X } from 'lucide-react'
import { useAppStore } from '../store'
import { clearOnlineSearch, searchOnlineNow } from '../api/online'
import { ThemeToggle } from './ThemeToggle'

const win = getCurrentWindow()

/**
 * The window's title bar: back/forward through pages, the one search box (filters the library as
 * you type, Enter searches online), activity, the theme toggle and the window controls. Empty
 * space drags the window.
 */
export function TopBar() {
  const canGoBack = useAppStore((s) => s.nav.back.length > 0)
  const canGoForward = useAppStore((s) => s.nav.forward.length > 0)
  const goBack = useAppStore((s) => s.goBack)
  const goForward = useAppStore((s) => s.goForward)
  const scanning = useAppStore((s) => s.library.scanState === 'scanning')
  const liveCount = useAppStore((s) => s.library.liveCount)
  const onlineSearching = useAppStore((s) => s.online.searchState === 'searching')
  const platform = useAppStore((s) => s.online.platform)

  return (
    // z-10 so its shadow falls over the page below
    <div
      data-tauri-drag-region
      className="h-14 shrink-0 relative z-10 flex items-center gap-4 pl-4 bg-app-bar border-b border-app-border shadow-[0_4px_12px_var(--color-app-bar-shadow)] select-none"
    >
      <div className="flex items-center gap-1">
        <NavButton onClick={goBack} disabled={!canGoBack} label="Back">
          <ChevronLeft size={16} />
        </NavButton>
        <NavButton onClick={goForward} disabled={!canGoForward} label="Forward">
          <ChevronRight size={16} />
        </NavButton>
      </div>

      <div data-tauri-drag-region className="flex-1 min-w-0 flex justify-center">
        <SearchBox />
      </div>

      <div data-tauri-drag-region className="flex items-center gap-4 shrink-0">
        {scanning && <Activity>scanning... {liveCount > 0 && `${liveCount} files`}</Activity>}
        {onlineSearching && <Activity>searching {platform}...</Activity>}
        <ThemeToggle />
      </div>

      <div className="flex items-stretch self-stretch">
        <WindowButton onClick={() => win.minimize()} label="Minimize">
          <Minus size={12} />
        </WindowButton>
        <WindowButton onClick={() => win.toggleMaximize()} label="Maximize">
          <Square size={10} />
        </WindowButton>
        <button
          onClick={() => win.close()}
          aria-label="Close"
          className="px-4 hover:bg-red-500 hover:text-white transition-colors text-app-muted flex items-center justify-center"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  )
}

/** Ctrl+K (⌘K) focuses it; Esc clears it and goes back to the page. */
function SearchBox() {
  const query = useAppStore((s) => s.query)
  const setQuery = useAppStore((s) => s.setQuery)
  const platform = useAppStore((s) => s.online.platform)
  const onlineReady = useAppStore((s) => s.ytDlp?.available !== false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  function changeQuery(value: string) {
    setQuery(value)
    if (!value.trim()) clearOnlineSearch()
  }

  return (
    <div className="w-full max-w-xl flex items-center gap-3 px-3 py-1.5 rounded-md border border-app-border bg-app-surface hover:border-app-accent focus-within:border-app-accent transition-colors">
      <Search size={15} className="text-app-muted shrink-0" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => changeQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') searchOnlineNow(query)
          if (e.key === 'Escape') {
            changeQuery('')
            inputRef.current?.blur()
          }
        }}
        placeholder={
          onlineReady ? `search library · enter to search ${platform}` : 'search library'
        }
        // no autofill, spellcheck or OS text suggestions while typing a search
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        className="bg-transparent text-app-text text-sm font-mono placeholder-app-muted outline-none flex-1 min-w-0"
      />
      <kbd className="text-[10px] font-mono text-app-muted shrink-0 hidden md:inline">ctrl k</kbd>
    </div>
  )
}

function NavButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void
  disabled: boolean
  label: string
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="w-7 h-7 rounded-md flex items-center justify-center text-app-secondary hover:bg-app-hover hover:text-app-text disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-app-secondary disabled:cursor-default transition-colors"
    >
      {children}
    </button>
  )
}

function WindowButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void
  label: string
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="px-4 hover:bg-app-hover transition-colors text-app-muted hover:text-app-text flex items-center justify-center"
    >
      {children}
    </button>
  )
}

function Activity({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-1.5 h-1.5 rounded-full bg-app-accent animate-pulse" />
      <span className="text-xs text-app-muted font-mono">{children}</span>
    </div>
  )
}
