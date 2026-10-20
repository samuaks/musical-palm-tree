/** `3:11`, or `1:02:44` past an hour; `--:--` when unknown. */
export function formatDuration(secs: number): string {
  if (!secs) return '--:--'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.floor(secs % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })

/** `630 views`, `248.5k views`, `1.2m views`. */
export function formatViews(n: number): string {
  return `${compact.format(n).toLowerCase()} ${n === 1 ? 'view' : 'views'}`
}

/** `1m ago`, `7mo ago`, ...; empty when unknown. */
export function formatRelative(ms: number): string {
  if (ms === 0) return ''
  const diff = Date.now() - ms
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const weeks = Math.floor(days / 7)
  const months = Math.floor(days / 30)
  const years = Math.floor(days / 365)

  if (years > 0) return `${years}y ago`
  if (months > 0) return `${months}mo ago`
  if (weeks > 0) return `${weeks}w ago`
  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'just now'
}
