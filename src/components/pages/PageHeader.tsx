import { ReactNode } from 'react'

/** A page's title and one quiet line under it; `children` go on the right (actions, stats). */
export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex items-end gap-4 px-6 pt-6 pb-2">
      <div className="flex-1 min-w-0">
        <h1 className="text-3xl font-sans font-semibold text-app-text tracking-tight truncate">
          {title}
        </h1>
        {subtitle && (
          <div className="mt-1.5 text-xs font-mono text-app-secondary truncate">{subtitle}</div>
        )}
      </div>
      {children}
    </div>
  )
}
