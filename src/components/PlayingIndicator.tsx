export function PlayingIndicator() {
  return (
    <div className="flex items-end gap-0.5 h-3 w-4">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="w-0.5 bg-app-accent animate-eq"
          style={{
            animationDelay: `${i * 0.15}s`,
            height: '100%',
          }}
        />
      ))}
    </div>
  )
}
