import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {listen} from "@tauri-apps/api/event";
import "./App.css";
import { Directory, ScanMetaData, ScanResult, ScanState } from "./types";
import { Header } from "./components/Header";
import { Library } from "./components/Library";
import { PlayerBar } from "./components/PlayerBar";
import { usePlayer } from "./hooks/usePlayer";
import { filterDirs } from "./utils/filterDirs";

function App() {
  const [scanMeta, setScanMeta] = useState<ScanMetaData | null>(null);
  const [dirs, setDirs] = useState<Directory[]>([]);
  const [query, setQuery] = useState('');
  const [scanState, setScanState] = useState<ScanState>('idle');

  const filteredDirs = useMemo(() => filterDirs(dirs, query), [dirs, query])

  useEffect(() => {
    setScanState('scanning')

    // mount listener
    const unlisten = listen<Directory[]>('scan_progress', event => {
      setDirs(event.payload)
    })


    invoke<ScanResult>("scan_media").then(r => {
      setDirs(r.directories)
      setScanMeta(r.metadata)
      setScanState('done')
    })  

    // unmount listener on cleanup
    return () => {
      unlisten.then(f => f())
    }
  }, []);

  const {
    currentTrack,
    next,
    play,
    prev
  } = usePlayer(dirs)

  return (
  <div className="bg-slate-800 h-screen font-mono flex flex-col overflow-hidden">
  <Header query={query}
  scanState={scanState}
  onSearch={setQuery} 
    scanMeta={scanMeta}
  />
  <Library
  scanState={scanState}  currentTrack={currentTrack} dirs={filteredDirs} onPlay={play} query={query} />
  
  <PlayerBar 
    track={currentTrack}
    onNext={next}
    onPrev={prev}
  />
  </div>

  )
}
export default App;
