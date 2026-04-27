import { useResizable } from '../hooks/useResizable'

interface VideoPaneProps {
  visible: boolean
}

export function VideoPane({ visible }: VideoPaneProps) {
  const { size: width, startDrag } = useResizable({
    defaultSize: 480,
    min: 240,
    maxFromViewport: 400,
    axis: 'horizontal',
    storageKey: 'playmusic-videopane-width',
  })

  return (
    <div
      id="video-pane"
      className={`shrink-0 border-l border-app-border bg-app-bg relative ${visible ? '' : 'hidden'}`}
      style={{ width: `${width}px` }}
    >
      <div
        onMouseDown={startDrag}
        className="absolute top-0 bottom-0 cursor-ew-resize z-10 group"
        style={{ left: '-6px', width: '12px' }}
      >
        <div className="absolute top-0 bottom-0 left-1/2 w-1 -translate-x-1/2 group-hover:bg-app-accent/30 transition-colors" />
      </div>
    </div>
  )
}
