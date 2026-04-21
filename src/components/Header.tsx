import { ScanMetaData } from "../types"

interface HeaderProps {
  query: string
  onSearch: (q: string) => void
  metaData: ScanMetaData | null
}

export function Header({ query, onSearch, metaData }: HeaderProps) {
  return (
    <div className="shrink-0 px-4 pt-4 pb-3 border-b border-slate-700">
      <span className="text-teal-400 font-bold tracking-wide text-sm">
        PlayMusic
      </span>
         {metaData && (
        <div className="text-xs text-slate-500 font-mono mt-1">
          {metaData.total_files} files · {metaData.total_albums} albums · {metaData.total_directories} dirs · {metaData.duration_ms}ms
        </div>
      )}
      <div className="flex items-center gap-2 mt-3">
        <span className="text-teal-400 text-sm">{'>'}</span>
        <input
          type="text"
          value={query}
          onChange={e => onSearch(e.target.value)}
          placeholder="type to search..."
          className="bg-transparent text-slate-300 text-sm font-mono placeholder-slate-600 outline-none w-full"
        />
      </div>
    </div>
  )
}