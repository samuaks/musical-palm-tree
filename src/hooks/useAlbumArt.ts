import { convertFileSrc } from '@tauri-apps/api/core';
import { parseBlob } from 'music-metadata';
import { useState, useEffect } from 'react'

const cache = new Map<string, string | null>()
let inFlight = 0;
const MAX_CONCURRENT = 4
const queue: Array<() => void> = []

function processQueue() {
    while (inFlight < MAX_CONCURRENT && queue.length > 0) {
        const next = queue.shift()
        next?.();
    }
}

async function loadAlbumArt(path: string): Promise<string | null> {
    if (cache.has(path)) return cache.get(path)!

    return new Promise(resolve => {
        queue.push(async () => {
            inFlight ++ 
            try {
                const response = await fetch(convertFileSrc(path))
                const blob = await response.blob()
                const metadata = await parseBlob(blob)
                const picture = metadata.common.picture?.[0]

                if (!picture) {
                    cache.set(path, null)
                    resolve(null)
                    return
                }

                const base64 = btoa(
                    Array.from(picture.data)
                    .map(b => String.fromCharCode(b))
                    .join('')
                )
                const dataUrl = `data:${picture.format};base64,${base64}`
                cache.set(path, dataUrl)
                resolve(dataUrl)
            } catch (e) {
                cache.set(path, null)
                resolve(null)
            } finally {
                inFlight--
                processQueue()
            }
        })
        processQueue()
    })
}

export function useAlbumArt(path: string, shouldLoad: boolean) {
  const [art, setArt] = useState<string | null>()

  useEffect(() => {
    if (!shouldLoad) return
    if (cache.has(path)) {
        setArt(cache.get(path))
        return
    }
    let cancelled = false
    loadAlbumArt(path).then(result => {
        if (!cancelled) setArt(result)
    })
    return () => {cancelled = true}
  }, [path, shouldLoad])

  return art
}