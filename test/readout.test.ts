import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createReadoutTracker } from '../src/readout.ts'

/** A generator stroking a sine at `spm` and `depth` round 0.5, sampled at 60 fps from `from` to `to` ms. */
function run(tracker: ReturnType<typeof createReadoutTracker>, spm: number, depth: number, from: number, to: number, phaseMs = 0) {
  const period = 60_000 / spm
  for (let t = from; t <= to; t += 1000 / 60) {
    // Bottom at phaseMs, phaseMs + period…
    const pos = 0.5 - (depth / 2) * Math.cos((2 * Math.PI * (t - phaseMs)) / period)
    tracker.feed(t, { spm, depth, pos })
  }
}

describe('following generated motion', () => {
  it('is not ready before a turn has been seen', () => {
    const tr = createReadoutTracker()
    assert.equal(tr.ready(), false)
    assert.deepEqual(tr.turns(0, 3000), [])
    run(tr, 60, 0.8, 0, 200, 0) // still rising from the bottom
    assert.equal(tr.ready(), false)
  })

  it('lays out the beats at the readout\'s tempo, in phase with the stroke', () => {
    const tr = createReadoutTracker()
    run(tr, 120, 0.8, 0, 3000, 100) // bottoms at 100, 600, 1100…
    assert.equal(tr.ready(), true)
    const now = 3000
    const turns = tr.turns(now, 2000)
    const bottoms = turns.filter(t => t.kind === 'bottom').map(t => t.at)
    const tops = turns.filter(t => t.kind === 'top').map(t => t.at)
    assert.equal(bottoms.length, 4)
    assert.equal(tops.length, 4)
    // Within a frame of the true beats: 3100, 3600, 4100, 4600.
    bottoms.forEach((at, i) => assert.ok(Math.abs(at - (3100 + i * 500)) <= 17, `bottom ${at}`))
    tops.forEach((at, i) => assert.ok(Math.abs(at - (3350 + i * 500)) <= 17, `top ${at}`))
    assert.equal(tr.spm(), 120)
  })

  it('gives the strokes their length and speed', () => {
    const tr = createReadoutTracker()
    run(tr, 60, 0.6, 0, 2500)
    const [b] = tr.turns(2500, 1500).filter(t => t.kind === 'bottom')
    assert.ok(Math.abs(b.amp - 60) < 1)
    assert.ok(Math.abs(b.pos - 20) < 1)
    // 60 units in half a second.
    assert.ok(Math.abs(b.speed - 120) < 2)
  })

  it('follows a tempo change within a stroke', () => {
    const tr = createReadoutTracker()
    run(tr, 60, 0.8, 0, 3000, 0)
    run(tr, 90, 0.8, 3000, 6000, 3000)
    const bottoms = tr.turns(6000, 2000).filter(t => t.kind === 'bottom').map(t => t.at)
    const gaps = bottoms.slice(1).map((t, i) => t - bottoms[i])
    gaps.forEach(g => assert.ok(Math.abs(g - 666.7) < 1))
  })

  it('stops when the generator stops, or barely moves', () => {
    const tr = createReadoutTracker()
    run(tr, 100, 0.8, 0, 3000)
    assert.equal(tr.ready(), true)
    tr.feed(3020, { spm: 0, depth: 0, pos: 0.5 })
    assert.equal(tr.ready(), false)
    assert.deepEqual(tr.turns(3020, 3000), [])
    run(tr, 100, 0.01, 3040, 6000)
    assert.equal(tr.ready(), false)
    assert.equal(tr.spm(), 0)
  })

  it('makes a smooth path through the coming turns, for the stroke guide', () => {
    const tr = createReadoutTracker()
    run(tr, 60, 1, 0, 3000)
    const p = tr.path(3000, 2000)
    assert.ok(p[0].at <= 3000)
    assert.ok(p[p.length - 1].at >= 5000)
    for (let i = 1; i < p.length; i++)
      assert.ok(p[i].at > p[i - 1].at)
    assert.ok(p.every(x => x.pos >= 0 && x.pos <= 100))
  })

  it('starts over after a gap in the frames', () => {
    const tr = createReadoutTracker()
    run(tr, 60, 0.8, 0, 3000)
    run(tr, 60, 0.8, 10_000, 10_100, 9_000)
    // Its last turns are kept, so it stays ready while it watches again.
    assert.equal(tr.ready(), true)
  })
})

describe('generated motion that says when its beat is (playhound 2.2)', () => {
  it('is ready at once and puts the beats where it says', () => {
    const tr = createReadoutTracker()
    tr.feed(1000, { spm: 120, depth: 0.8, pos: 0.5, nextStrokeInMs: 200 })
    assert.equal(tr.ready(), true)
    const bottoms = tr.turns(1000, 1500).filter(t => t.kind === 'bottom').map(t => t.at)
    assert.deepEqual(bottoms, [1200, 1700, 2200])
  })

  it('falls back to watching the stroke when it says nothing', () => {
    const tr = createReadoutTracker()
    tr.feed(1000, { spm: 120, depth: 0.8, pos: 0.5, nextStrokeInMs: null })
    assert.equal(tr.ready(), false)
  })
})
