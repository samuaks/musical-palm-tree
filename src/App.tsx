import { useMemo, useState } from 'react'
import './App.css'
import { Header } from './components/Header'
import { Library } from './components/Library'
import { PlayerBar } from './components/PlayerBar'
import { usePlayer } from './hooks/usePlayer'
import { filterDirs } from './utils/filterDirs'
import { useScan } from './hooks/useScan'
import { useDurations } from './hooks/useDurations'
import { isVideo } from './constants'
import { VideoPane } from './components/VideoPane'

function App() {
  const [query, setQuery] = useState('')
  const { scanMeta, dirs, liveCount, scanState } = useScan()
  const durations = useDurations(dirs)

  const filteredDirs = useMemo(() => filterDirs(dirs, query), [dirs, query])

  const { currentTrack, next, play, prev } = usePlayer(dirs)

  return (
    <div className="bg-slate-800 h-screen font-mono flex flex-col overflow-hidden">
      <Header
        query={query}
        scanState={scanState}
        onSearch={setQuery}
        scanMeta={scanMeta}
        liveCount={liveCount}
      />
      <div className="flex-1 flex overflow-hidden">
        <Library
          scanState={scanState}
          durations={durations}
          currentTrack={currentTrack}
          dirs={filteredDirs}
          onPlay={play}
          query={query}
        />

        <VideoPane visible={!!(currentTrack && isVideo(currentTrack.ext))} />
      </div>
      <PlayerBar track={currentTrack} onNext={next} onPrev={prev} />
    </div>
  )
}
export default App
