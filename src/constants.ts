export const VIDEO_EXTS = ['mp4', 'mkv', 'webm', 'avi', 'mov']
export const AUDIO_EXTS = ['mp3', 'flac', 'wav', 'aac', 'ogg']

export function isVideo(ext: string): boolean {
  return VIDEO_EXTS.includes(ext.toLowerCase())
}

export function isAudio(ext: string): boolean {
  return AUDIO_EXTS.includes(ext.toLowerCase())
}