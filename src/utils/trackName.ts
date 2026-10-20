/** ` [<YouTube id>]` that downloads put at the end of file names (see download.rs). */
const YOUTUBE_ID_SUFFIX = / \[[A-Za-z0-9_-]{11}\]$/

/**
 * A track's name as shown in the UI: without the file extension, and without the YouTube id
 * that downloaded files carry (`Moottorisaha [NBIXe0iUE-M].m4a` → `Moottorisaha`). Search still
 * matches the full file name.
 */
export function displayName(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, '').replace(YOUTUBE_ID_SUFFIX, '')
}
