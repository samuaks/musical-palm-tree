import { useEffect, useRef, useState } from "react";
import { Directory } from "../types";
import { convertFileSrc } from "@tauri-apps/api/core";


function getDuration(path: string): Promise<number> {
    return new Promise((resolve) => {
        const audio = new Audio();
        audio.src = convertFileSrc(path);
        audio.onloadedmetadata = () => {
            resolve(audio.duration || 0);
            audio.src = "";
        }
        audio.onerror = () => {
            resolve(0);
        }
    })
}

const CONCURRENT_LIMIT = 6;

export function useDurations(dirs: Directory[]) {
    const [durations, setDurations] = useState<Record<string, number>>({});

    const queue = useRef<string[]>([]);

    const inFlight = useRef(0);

    useEffect(() => {
        const allFiles = dirs.flatMap(d => [
            ...d.files.map(f => f.path),
            ...d.albums.flatMap(a => a.files.map(f => f.path))
        ])
        queue.current = allFiles.filter(path => !(path in durations));
        pump();
    }, [dirs])

    function pump() {
        while (inFlight.current < CONCURRENT_LIMIT && queue.current.length > 0) {
            const path = queue.current.shift()!;
            inFlight.current++;
            getDuration(path).then(duration => {
                setDurations(prev => ({ ...prev, [path]: duration }));
                inFlight.current--;
                pump();
            })
        }
    }
    return durations;

}