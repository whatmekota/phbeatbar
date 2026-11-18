import type { Turn } from './turns'
import type { PluginAchievement } from './types'
import { firstAtOrAfter } from './turns'

/**
 * The bar's own achievements, in playhound's Stats → Achievements: beats
 * that reached the hit zone, and a minute at a fast tempo. A beat counts
 * when it lands while the bar shows and the video plays (or generated motion
 * strokes), with no edge holding back. The running count is kept in the
 * plugin's storage, as playhound only keeps what it is told.
 */

export const ACHIEVEMENTS: PluginAchievement[] = [
  { id: 'beats-100', title: 'Warmed up', description: '100 beats on the beat bar', icon: '🥁', target: 100 },
  { id: 'beats-1000', title: 'In the groove', description: '1,000 beats on the beat bar', icon: '🎵', target: 1000, tier: 2 },
  { id: 'beats-10000', title: 'Human metronome', description: '10,000 beats on the beat bar', icon: '⏱️', target: 10_000, tier: 3 },
  { id: 'fast-minute', title: 'Double time', description: 'A minute of beats at 180 a minute or faster, without a break', icon: '🔥', tier: 2 },
]

const COUNTED = ACHIEVEMENTS.filter(a => a.target)

/** The tempo, strokes a minute, and how long it has to last for 'fast-minute'. */
export const FAST_SPM = 180
export const FAST_FOR_MS = 60_000
/** The count is reported and saved every this many beats (and when the bar goes). */
export const SAVE_EVERY = 20

/** Beats (bottom turns) reached between two frames' times: after `from`, up to `to`. */
export function beatsBetween(turns: readonly Turn[], from: number, to: number): number {
  if (!(to > from))
    return 0
  let n = 0
  for (let i = firstAtOrAfter(turns, from); i < turns.length && turns[i].at <= to; i++) {
    if (turns[i].at > from && turns[i].kind === 'bottom')
      n++
  }
  return n
}

/** Frames further apart than this, ms, are a break (the bar hid, the tab was in the background). */
const FRAME_GAP_MS = 500

/**
 * A fast stretch: fed every frame the bar draws with whether beats are
 * landing and their tempo, it says true once, on the frame the stretch has
 * lasted FAST_FOR_MS. A slower beat, a pause, or a break in the frames
 * starts it over.
 */
export function createFastTimer(): (now: number, spm: number, landing: boolean) => boolean {
  let since: number | null = null
  let last = -Infinity
  let done = false
  return (now, spm, landing) => {
    const gap = now - last > FRAME_GAP_MS
    last = now
    if (!landing || !(spm >= FAST_SPM) || gap) {
      since = landing && spm >= FAST_SPM ? now : null
      done = false
      return false
    }
    since ??= now
    if (done || now - since < FAST_FOR_MS)
      return false
    done = true
    return true
  }
}

export interface BeatCounter {
  add: (n: number) => void
  /** Report and save what has been counted since the last time. */
  flush: () => void
  total: () => number
}

/** The running count of beats, loaded from storage, saved and reported every SAVE_EVERY. */
export function createBeatCounter(io: {
  load: () => Promise<unknown>
  save: (total: number) => void
  progress: (id: string, total: number) => void
}): BeatCounter {
  /** What storage had, plus what has been flushed since; null until it is read. */
  let saved: number | null = null
  let pending = 0

  function flush() {
    if (saved === null || pending <= 0)
      return
    saved += pending
    pending = 0
    io.save(saved)
    for (const a of COUNTED)
      io.progress(a.id, saved)
  }

  io.load().then((n) => {
    saved = typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
    flush()
  }, () => {
    saved = 0
  })

  return {
    add(n) {
      if (!(n > 0))
        return
      pending += n
      if (pending >= SAVE_EVERY)
        flush()
    },
    flush,
    total: () => (saved ?? 0) + pending,
  }
}
