import './App.css'
import { Header } from './components/Header'
import { MainView } from './components/MainView'
import { PlayerBar } from './components/PlayerBar'
import { VideoPane } from './components/VideoPane'
import { Titlebar } from './components/TitleBar'
import { useOnlineAvailability } from './hooks/useOnlineAvailability'

function App() {
  useOnlineAvailability()

  return (
    <div className="h-screen font-mono flex flex-col overflow-hidden relative">
      <Titlebar />
      <Header />
      <div className="flex-1 flex overflow-hidden">
        <MainView />
        <VideoPane />
      </div>
      <PlayerBar />
    </div>
  )
}
export default App
