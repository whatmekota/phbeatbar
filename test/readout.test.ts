import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createReadoutTracker, strokeUnit, TOP_AT } from '../src/readout.ts'

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

describe('generated motion that says when its beat is', () => {
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

describe('the generator\'s stroke shape', () => {
  /** A tracker told the next bottom is 200 ms off, at 60 spm, full depth. */
  function told(shape: 'sine' | 'ease' | 'pulse' | 'saw' | 'sharp') {
    const tr = createReadoutTracker()
    tr.feed(1000, { spm: 60, depth: 1, pos: 0.5, nextStrokeInMs: 200, shape })
    return tr
  }

  it('matches playhound\'s curves at the turns', () => {
    for (const shape of ['sine', 'ease', 'pulse', 'saw', 'sharp'] as const) {
      assert.equal(strokeUnit(0, shape), 0, shape)
      assert.ok(Math.abs(strokeUnit(TOP_AT[shape], shape) - 1) < 1e-9, shape)
      assert.ok(Math.abs(strokeUnit(1, shape)) < 1e-9, shape)
    }
  })

  it('puts the tops where the shape has them: late for a saw, early for a pulse', () => {
    const top = (shape: 'sine' | 'pulse' | 'saw') => told(shape).turns(1000, 1000).find(t => t.kind === 'top')!.at
    assert.equal(top('sine'), 1200 + 500)
    assert.equal(top('saw'), 1200 + 750)
    assert.ok(Math.abs(top('pulse') - (1200 + 1000 / 3)) < 1e-6)
  })

  it('gives each half its own speed: a saw drops three times as fast as it rises', () => {
    const ts = told('saw').turns(1000, 2500)
    const up = ts.find(t => t.kind === 'top')!.speed
    const down = ts.find(t => t.kind === 'bottom')!.speed
    assert.ok(Math.abs(down / up - 3) < 1e-9)
  })

  it('draws the path in the shape: straight for sharp, eased for a sine', () => {
    // A quarter of a stroke after the bottom at 1200: halfway up for sharp, less for a sine.
    const at = (shape: 'sine' | 'sharp', t: number) => {
      const p = told(shape).path(1000, 2000)
      const i = p.findIndex(x => x.at >= t)
      return p[i].pos
    }
    assert.ok(Math.abs(at('sharp', 1450) - 50) < 1e-6)
    assert.ok(Math.abs(at('sine', 1450) - 50) < 1e-6)
    assert.ok(at('sharp', 1325) > at('sine', 1325) + 8)
  })

  it('takes a missing shape as a sine', () => {
    const tr = createReadoutTracker()
    tr.feed(1000, { spm: 60, depth: 1, pos: 0.5, nextStrokeInMs: 200 })
    assert.equal(tr.turns(1000, 1000).find(t => t.kind === 'top')!.at, 1700)
  })
})
