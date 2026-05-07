import { useState, useEffect, RefObject } from 'react'

export function useFullscreen(elementRef: RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    function handleChange() {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleChange)
    return () => document.removeEventListener('fullscreenchange', handleChange)
  }, [])

  function toggle() {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      elementRef.current?.requestFullscreen()
    }
  }

  return { isFullscreen, toggle }
}
