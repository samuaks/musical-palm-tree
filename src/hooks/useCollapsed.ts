import { useState, useCallback, useEffect } from 'react'

const STORAGE_KEY = 'playmusic-collapsed'

export function useCollapsed() {
    const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
        console.log('loaded from localStorage:', saved)
      return saved ? new Set(JSON.parse(saved)) : new Set()
    } catch {
      return new Set()
    }
  })

    useEffect(() => {
        console.log('saving to localStorage:', [...collapsed])
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsed]))
  }, [collapsed])


  const toggle = useCallback((key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const collapseAll = useCallback((keys: string[]) => {
    setCollapsed(new Set(keys))
  }, [])

  const expandAll = useCallback(() => {
    setCollapsed(new Set())
  }, [])

  const isCollapsed = useCallback((key: string) => collapsed.has(key), [collapsed])

  return { isCollapsed, toggle, collapseAll, expandAll }
}