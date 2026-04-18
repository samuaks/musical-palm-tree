export function TrackSkeleton() {
  return (
    <div className="flex items-center gap-3 px-6 py-2">
      <div className="flex flex-col gap-1 flex-1">
        <div className="h-4 bg-slate-700 rounded animate-pulse w-3/4" />
        <div className="h-4 w-4 bg-slate-700 rounded animate-pulse" />
      </div>
    </div>
  )
}

export function AlbumSkeleton() {
  return (
    <div className="mb-4">
      <div className="px-4 py-1 mt-3">
        <div className="h-3 bg-slate-700 rounded animate-pulse w-24" />
      </div>
      <div className="pl-8 py-1 mt-2">
        <div className="h-3 bg-slate-700 rounded animate-pulse w-32" />
      </div>
      <div className="pl-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <TrackSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}