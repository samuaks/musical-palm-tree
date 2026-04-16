interface HeaderProps {
  query: string
  onSearch: (q: string) => void
}

export function Header({ query, onSearch }: HeaderProps) {
  return (
    <div className="shrink-0 px-4 pt-4 pb-3 border-b border-slate-700">
      <span className="text-teal-400 font-bold tracking-wide text-sm">
        PlayMusic
      </span>
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