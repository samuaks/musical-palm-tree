/**
 * The ` [<id>]` that downloads put at the end of file names (see download.rs): an 11-character
 * YouTube id, or a Twitch VOD id like `v2905135575`.
 */
const DOWNLOAD_ID_SUFFIX = / \[(?:[A-Za-z0-9_-]{11}|v\d+)\]$/

/**
 * A track's name as shown in the UI: without the file extension, and without the id that
 * downloaded files carry (`Moottorisaha [NBIXe0iUE-M].m4a` → `Moottorisaha`). Search still
 * matches the full file name.
 */
export function displayName(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, '').replace(DOWNLOAD_ID_SUFFIX, '')
}
