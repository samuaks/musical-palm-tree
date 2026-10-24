import './App.css'
import { MainView } from './components/MainView'
import { PlayerBar } from './components/PlayerBar'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { VideoPane } from './components/VideoPane'
import { useOnlineAvailability } from './hooks/useOnlineAvailability'

function App() {
  useOnlineAvailability()

  return (
    <div className="h-screen font-mono flex flex-col overflow-hidden relative">
      <div className="flex-1 min-h-0 flex">
        <Sidebar />
        <div className="flex-1 min-w-0 flex flex-col">
          <TopBar />
          <div className="flex-1 min-h-0 flex overflow-hidden">
            <MainView />
            <VideoPane />
          </div>
        </div>
      </div>
      <PlayerBar />
    </div>
  )
}
export default App
