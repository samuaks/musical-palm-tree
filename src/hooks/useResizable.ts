import { useState, useRef, useEffect } from 'react'

interface UseResizableOptions {
  defaultSize: number
  min?: number
  maxFromViewport?: number
  axis?: 'vertical' | 'horizontal'
  storageKey?: string
}

export function useResizable({
  defaultSize,
  min = 128,
  maxFromViewport = 100,
  axis = 'vertical',
  storageKey,
}: UseResizableOptions) {
  const [size, setSize] = useState<number>(() => {
    if (!storageKey) return defaultSize
    try {
      const saved = localStorage.getItem(storageKey)
      return saved ? Number(saved) : defaultSize
    } catch {
      return defaultSize
    }
  })
  const dragging = useRef(false)

  useEffect(() => {
    if (!storageKey) return
    localStorage.setItem(storageKey, String(size))
  }, [size, storageKey])

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!dragging.current) return
      const newSize =
        axis === 'vertical' ? window.innerHeight - e.clientY : window.innerWidth - e.clientX
      const max = (axis === 'vertical' ? window.innerHeight : window.innerWidth) - maxFromViewport
      setSize(Math.max(min, Math.min(max, newSize)))
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
    document.body.style.cursor = axis === 'vertical' ? 'ns-resize' : 'ew-resize'
    document.body.style.userSelect = 'none'
  }

  return { size, setSize, startDrag }
}
