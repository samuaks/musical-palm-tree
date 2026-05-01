import './App.css'
import { Header } from './components/Header'
import { Library } from './components/Library'
import { PlayerBar } from './components/PlayerBar'
import { useScan } from './hooks/useScan'
import { useDurations } from './hooks/useDurations'
import { VideoPane } from './components/VideoPane'
import { Titlebar } from './components/TitleBar'

function App() {
  useScan()
  useDurations()

  return (
    <div className="h-screen font-mono flex flex-col overflow-hidden">
      <Titlebar />
      <Header />
      <div className="flex-1 flex overflow-hidden">
        <Library />

        <VideoPane />
      </div>
      <PlayerBar />
    </div>
  )
}
export default App
