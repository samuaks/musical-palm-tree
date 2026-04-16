import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import { Directory } from "./types";
import { TrackList } from "./components/TrackList";

function App() {
  const [dirs, setDirs] = useState<Directory[]>([]);

  useEffect(() => {
    invoke<Directory[]>("scan_media").then(setDirs)  
  }, []);

  
  return (
    <>
       {dirs.map(dir => (
        <div className="bg-gray-500" key={dir.path}>
          <h1 className="text-2xl font-bold mb-4">{dir.name}</h1>
          <TrackList files={dir.files} currentTrack={null} onPlay={() => {}} />
          {dir.albums.map(album => (
            <div key={album.name} className="mt-6">
              <h2 key={album.name} className="text-xl font-semibold mt-6 mb-2">{album.name}</h2>
              <TrackList files={album.files} currentTrack={null} onPlay={() => {}} />
            </div>
          ))}
        </div>
       ))}
      </>
  );
}

export default App;
