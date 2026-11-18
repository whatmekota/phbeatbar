import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ACHIEVEMENTS, beatsBetween, createBeatCounter, createFastTimer, FAST_FOR_MS, SAVE_EVERY } from '../src/achievements.ts'
import { cleanActions, turningPoints } from '../src/turns.ts'

/** Bottoms at 0, 1000, 2000…, tops between. */
const turns = turningPoints(cleanActions(Array.from({ length: 12 }, (_, i) => ({ at: i * 500, pos: i % 2 ? 100 : 0 }))))

describe('the achievements', () => {
  it('have ids playhound takes, each once', () => {
    const ids = ACHIEVEMENTS.map(a => a.id)
    assert.equal(new Set(ids).size, ids.length)
    assert.ok(ids.every(id => /^[a-z0-9-]+$/.test(id)))
  })
})

describe('counting beats', () => {
  it('counts the bottoms a frame steps over, each once', () => {
    assert.equal(beatsBetween(turns, 990, 1006), 1)
    assert.equal(beatsBetween(turns, 1000, 1016), 0)
    assert.equal(beatsBetween(turns, 1200, 1700), 0) // a top only
    assert.equal(beatsBetween(turns, 500, 2500), 2)
    assert.equal(beatsBetween(turns, 1016, 990), 0)
  })

  it('saves and reports the running total every few beats, on top of what was stored', async () => {
    const saved: number[] = []
    const reported: Record<string, number> = {}
    const c = createBeatCounter({ load: async () => 480, save: n => saved.push(n), progress: (id, n) => (reported[id] = n) })
    await Promise.resolve()
    c.add(SAVE_EVERY - 1)
    assert.deepEqual(saved, [])
    c.add(1)
    assert.deepEqual(saved, [480 + SAVE_EVERY])
    assert.equal(reported['beats-1000'], 480 + SAVE_EVERY)
    c.add(3)
    c.flush()
    assert.equal(saved.at(-1), 480 + SAVE_EVERY + 3)
    assert.equal(c.total(), 480 + SAVE_EVERY + 3)
  })

  it('keeps beats counted before storage answers', async () => {
    const saved: number[] = []
    let answer!: (n: unknown) => void
    const c = createBeatCounter({ load: () => new Promise((r) => { answer = r }), save: n => saved.push(n), progress: () => {} })
    c.add(SAVE_EVERY + 5)
    assert.deepEqual(saved, [])
    answer(undefined)
    await Promise.resolve()
    assert.deepEqual(saved, [SAVE_EVERY + 5])
  })
})

describe('a fast minute', () => {
  it('fires once a minute of fast beats has run, and not again in the same stretch', () => {
    const fast = createFastTimer()
    let fired = 0
    for (let t = 0; t <= FAST_FOR_MS + 2000; t += 16)
      fired += fast(t, 190, true) ? 1 : 0
    assert.equal(fired, 1)
  })

  it('starts over after a slower beat, a pause or a break in the frames', () => {
    const fast = createFastTimer()
    let fired = false
    for (let t = 0; t < FAST_FOR_MS * 2; t += 16) {
      const slow = Math.abs(t - FAST_FOR_MS * 0.9) < 20
      fired ||= fast(t, slow ? 120 : 190, true) && t < FAST_FOR_MS * 1.5
    }
    assert.equal(fired, false)
    const again = createFastTimer()
    for (let t = 0; t < FAST_FOR_MS - 100; t += 16)
      again(t, 190, true)
    // The bar hid for a while: the time away doesn't count.
    assert.equal(again(FAST_FOR_MS + 5000, 190, true), false)
  })
})
