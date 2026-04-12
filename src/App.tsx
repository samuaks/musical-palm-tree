import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import { Directory } from "./types";

function App() {
  const [dirs, setDirs] = useState<Directory[]>([]);

  useEffect(() => {
    invoke<Directory[]>("scan_media").then(setDirs)  
  }, []);

  
  return (
    <main className="m-0 pt-10 flex flex-col justify-center text-left">
        <div>
      {dirs.map(dir => (
        <div key={dir.path}>
          <h1 className="text-3xl text-amber-500">{dir.name}</h1>
          {dir.files.map(file => (
            <div key={file.path} className="ml-6 text-amber-300">
              {file.name}
            </div>
          ))}
          {dir.albums.map(album => (
            <div key={album.name} className="ml-4">
              <h2 className="text-2xl text-amber-400">{album.name}</h2>
              {album.files.map(file => (
                <div key={file.path} className="ml-6 text-amber-300">
                  {file.name}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>

    </main>
  );
}

export default App;
