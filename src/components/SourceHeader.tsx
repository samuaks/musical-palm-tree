import { ReactNode } from 'react'

/** Heads the LIBRARY and ONLINE parts of the main view while searching. */
export function SourceHeader({
  name,
  count,
  children,
}: {
  name: string
  count?: number
  /** Extra controls after the count (the ONLINE platform tabs). */
  children?: ReactNode
}) {
  return (
    <div className="flex items-baseline gap-3 px-6 pt-5 pb-1">
      <span className="text-[11px] font-mono font-bold text-app-text tracking-[0.2em] uppercase">
        {name}
      </span>
      {count !== undefined && (
        <span className="text-xs font-mono text-app-muted tabular-nums">{count}</span>
      )}
      {children}
    </div>
  )
}
