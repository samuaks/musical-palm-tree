import './App.css'
import { Header } from './components/Header'
import { PlayerBar } from './components/PlayerBar'
import { VideoPane } from './components/VideoPane'
import { Titlebar } from './components/TitleBar'
import { useAppStore } from './store'
import { SPACES } from './spaces'
import { SpaceSidebar } from './components/SpaceSidebar'

function App() {
  const activeSpaceId = useAppStore((s) => s.activeSpaceId)
  const ActiveSpace = SPACES.find((s) => s.id === activeSpaceId)?.Component ?? (() => null)

  return (
    <div className="h-screen font-mono flex flex-col overflow-hidden relative">
      <Titlebar />
      <Header />
      <div className="flex-1 flex overflow-hidden">
        <SpaceSidebar />
        <ActiveSpace />
        <VideoPane />
      </div>
      <PlayerBar />
    </div>
  )
}
export default App
