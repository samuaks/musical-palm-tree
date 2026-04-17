import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import { Directory } from "./types";
import { Header } from "./components/Header";
import { Library } from "./components/Library";
import { PlayerBar } from "./components/PlayerBar";
import { usePlayer } from "./hooks/usePlayer";

function App() {
  const [dirs, setDirs] = useState<Directory[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    invoke<Directory[]>("scan_media").then(setDirs)  
  }, []);

  const {
    currentTrack,
    next,
    play,
    prev
  } = usePlayer(dirs)

  
  return (
  <div className="bg-slate-800 h-screen font-mono flex flex-col">
  
  <Header query={query} onSearch={setQuery} />

  <Library currentTrack={currentTrack} dirs={dirs} onPlay={play} query={query} />

    <PlayerBar 
      track={currentTrack}
      onNext={next}
      onPrev={prev}
    />

  </div>

  )
}
export default App;
