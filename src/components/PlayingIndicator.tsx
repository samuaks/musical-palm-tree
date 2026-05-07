interface PlayingIndicatorProps {
  playing?: boolean
}

export function PlayingIndicator({ playing }: PlayingIndicatorProps) {
  return (
    <div className="flex items-end justify-end gap-0.5 h-3 w-full">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={`w-0.5 bg-app-accent ${playing ? 'animate-eq' : ''} `}
          style={{
            animationDelay: `${i * 0.15}s`,
            height: playing ? '100%' : '50%',
          }}
        />
      ))}
    </div>
  )
}
