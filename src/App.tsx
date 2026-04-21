import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import { Directory, ScanMetaData, ScanResult } from "./types";
import { Header } from "./components/Header";
import { Library } from "./components/Library";
import { PlayerBar } from "./components/PlayerBar";
import { usePlayer } from "./hooks/usePlayer";

function App() {
  const [scanMeta, setScanMeta] = useState<ScanMetaData | null>(null);
  const [dirs, setDirs] = useState<Directory[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    invoke<ScanResult>("scan_media").then(r => {
      setDirs(r.directories)
      setScanMeta(r.metadata)
      setLoading(false)
    })  
  }, []);

  const {
    currentTrack,
    next,
    play,
    prev
  } = usePlayer(dirs)

  return (
  <div className="bg-slate-800 h-screen font-mono flex flex-col overflow-hidden">
  <Header query={query} onSearch={setQuery} 
    metaData={scanMeta}
  />
  <Library
  loading={loading}
  currentTrack={currentTrack} dirs={dirs} onPlay={play} query={query} />
  
  <PlayerBar 
    track={currentTrack}
    onNext={next}
    onPrev={prev}
  />
  </div>

  )
}
export default App;
