import { invoke } from '@tauri-apps/api/core'
import type Hls from 'hls.js'
import type {
  HlsConfig,
  Loader,
  LoaderCallbacks,
  LoaderConfiguration,
  LoaderStats,
  PlaylistLoaderContext,
} from 'hls.js'

/**
 * Plays a Twitch live stream in `el` with hls.js and returns a function that stops it.
 *
 * Live is different from VODs, which the WebView plays natively: live segments are MPEG-TS (the
 * built-in HLS player only takes fMP4), and Twitch's playlist server refuses requests whose
 * `Origin` isn't twitch.tv. hls.js converts the segments, and playlists are fetched in Rust
 * (`fetch_live_playlist`), which sends no Origin. Segments load directly (they allow any origin).
 *
 * hls.js is imported here, on first use, so it isn't part of the main bundle.
 */
export async function attachLive(
  el: HTMLMediaElement,
  url: string,
  onFatal: (message: string) => void
): Promise<() => void> {
  const { default: HlsClass, LoadStats } = await import('hls.js')

  /** hls.js playlist loader that fetches through Rust; see `fetch_live_playlist`. */
  class RustPlaylistLoader implements Loader<PlaylistLoaderContext> {
    context: PlaylistLoaderContext | null = null
    stats: LoaderStats = new LoadStats()
    private done = false

    // hls.js passes its config; nothing in it applies here.
    constructor(_config: HlsConfig) {}

    load(
      context: PlaylistLoaderContext,
      _config: LoaderConfiguration,
      callbacks: LoaderCallbacks<PlaylistLoaderContext>
    ) {
      this.context = context
      const stats = this.stats
      stats.loading.start = performance.now()
      invoke<string>('fetch_live_playlist', { url: context.url })
        .then((data) => {
          if (this.done) return
          stats.loading.first = stats.loading.end = performance.now()
          stats.loaded = stats.total = data.length
          callbacks.onSuccess({ url: context.url, data }, stats, context, null)
        })
        .catch((e) => {
          if (this.done) return
          callbacks.onError({ code: 0, text: String(e) }, context, null, stats)
        })
    }

    abort() {
      this.done = true
      this.stats.aborted = true
    }

    destroy() {
      this.done = true
      this.context = null
    }
  }

  const hls: Hls = new HlsClass({
    pLoader: RustPlaylistLoader,
    lowLatencyMode: false,
    liveSyncDurationCount: 3,
  })
  hls.on(HlsClass.Events.ERROR, (_event, data) => {
    if (data.fatal) onFatal(`${data.type}: ${data.details}`)
  })
  hls.loadSource(url)
  hls.attachMedia(el)
  return () => hls.destroy()
}
