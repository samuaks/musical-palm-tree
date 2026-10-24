import Fuse, { Expression } from 'fuse.js'
import { OnlineSearchResult } from '../types'
import { TwitchChannel } from './plays'

/** How close a word has to be (Fuse's 0–1 scale, like `filterDirs`). */
const THRESHOLD = 0.4

/** The words of a query; each one has to match something (in any order, with typos). */
function words(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 2)
}

/**
 * The results of the last search that still fit `query`, fuzzily: every word of it has to match
 * the title or the channel, in any order, typos allowed. Order is kept (YouTube's relevance).
 * With no usable words, all results fit.
 */
export function refineResults(results: OnlineSearchResult[], query: string): OnlineSearchResult[] {
  const terms = words(query)
  if (terms.length === 0) return results
  const fuse = new Fuse(results, {
    keys: ['title', 'uploader'],
    threshold: THRESHOLD,
    ignoreLocation: true,
    minMatchCharLength: 2,
  })
  // each word matches the title or the channel
  const field = (key: string, word: string): Expression => ({ [key]: word })
  const expression: Expression = {
    $and: terms.map((w): Expression => ({ $or: [field('title', w), field('uploader', w)] })),
  }
  const matches = new Set(fuse.search(expression).map((r) => r.item))
  return results.filter((r) => matches.has(r))
}

/** The channels whose name looks like `query` (typos and spaces allowed), best first. */
export function suggestChannels(
  channels: TwitchChannel[],
  query: string,
  limit: number
): TwitchChannel[] {
  // Twitch logins have no spaces: "kai cenat" is looked up as "kaicenat"
  const name = query.toLowerCase().replace(/\s+/g, '')
  if (name.length < 2) return []
  const fuse = new Fuse(channels, {
    keys: ['name', 'display'],
    threshold: THRESHOLD,
    ignoreLocation: true,
  })
  return fuse
    .search(name)
    .slice(0, limit)
    .map((r) => r.item)
}
