import { useState, useRef, useEffect } from 'react'

interface UseResizableOptions {
  defaultHeight: number
  min?: number
  maxFromViewport?: number // subtract from window.innerHeight for max
}

export function useResizable({ defaultHeight, min = 128, maxFromViewport = 100 }: UseResizableOptions) {
  const [height, setHeight] = useState(defaultHeight)
  const dragging = useRef(false)

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!dragging.current) return
      const newHeight = window.innerHeight - e.clientY
      const max = window.innerHeight - maxFromViewport
      setHeight(Math.max(min, Math.min(max, newHeight)))
    }
    function handleMouseUp() {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [min, maxFromViewport])

  function startDrag() {
    dragging.current = true
    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'
  }

  return { height, setHeight, startDrag }
}