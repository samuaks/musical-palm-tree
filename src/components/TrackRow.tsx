import { ReactNode, RefObject } from 'react'

interface TrackRowProps {
  active: boolean
  /** The cover; for the current track it also shows the playing indicator. */
  cover: ReactNode
  title: ReactNode
  subtitle: ReactNode
  /** Shown after the subtitle and never cut off (e.g. `13h ago`); the subtitle shortens first. */
  subtitleEnd?: string
  /** `3:11`, or a LIVE badge */
  duration: ReactNode
  /** Buttons on the right (e.g. downloads); clicks on them don't play the row. */
  actions?: ReactNode
  /** For ScrollToActive, which finds the playing row by it. */
  dataPath: string
  onClick: () => void
  rowRef?: RefObject<HTMLDivElement | null>
}

/** One track in a list, the same for library tracks and YouTube results. */
export function TrackRow({
  active,
  cover,
  title,
  subtitle,
  subtitleEnd,
  duration,
  actions,
  dataPath,
  onClick,
  rowRef,
}: TrackRowProps) {
  return (
    <div
      ref={rowRef}
      data-track-path={dataPath}
      // Not focusable on purpose: the global shortcuts (space, arrows) only fire while focus
      // stays on the page body.
      onClick={onClick}
      className={`group flex items-center gap-4 px-6 py-1.5 cursor-pointer transition-colors ${
        active ? 'bg-app-selected' : 'hover:bg-app-hover'
      }`}
    >
      {cover}

      <div className="flex-1 min-w-0">
        <div
          className={`text-sm font-mono truncate ${active ? 'text-app-accent' : 'text-app-text'}`}
        >
          {title}
        </div>
        <div className="flex text-xs font-mono text-app-secondary">
          <span className="truncate min-w-0">{subtitle}</span>
          {subtitleEnd && <span className="shrink-0 whitespace-pre"> · {subtitleEnd}</span>}
        </div>
      </div>

      {actions && (
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      )}

      <span className="text-sm font-mono text-app-secondary tabular-nums text-right w-16 shrink-0">
        {duration}
      </span>
    </div>
  )
}
