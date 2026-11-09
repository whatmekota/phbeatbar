import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cleanActions, firstAtOrAfter, pathBetween, positionAt, spmAround, turningPoints } from '../src/turns.ts'

const kinds = (s: { kind: string, at: number }[]) => s.map(t => `${t.kind[0]}${t.at}`).join(' ')

describe('cleaning a script', () => {
  it('sorts, clamps and drops what is not a point', () => {
    const got = cleanActions([
      { at: 200, pos: 50 },
      { at: 0, pos: -5 },
      { at: Number.NaN, pos: 10 },
      { at: 100, pos: 130 },
      { at: 300, pos: Number.POSITIVE_INFINITY },
    ])
    assert.deepEqual(got, [{ at: 0, pos: 0 }, { at: 100, pos: 100 }, { at: 200, pos: 50 }])
  })

  it('keeps the later of two points at the same time', () => {
    assert.deepEqual(cleanActions([{ at: 0, pos: 10 }, { at: 0, pos: 90 }, { at: 50, pos: 0 }]), [{ at: 0, pos: 90 }, { at: 50, pos: 0 }])
  })
})

describe('turning points', () => {
  it('finds each top and bottom of a plain stroke', () => {
    const a = cleanActions([
      { at: 0, pos: 0 },
      { at: 250, pos: 100 },
      { at: 500, pos: 0 },
      { at: 750, pos: 100 },
      { at: 1000, pos: 0 },
    ])
    const t = turningPoints(a)
    assert.equal(kinds(t), 'b0 t250 b500 t750 b1000')
    assert.equal(t[2].amp, 100)
    assert.equal(t[2].speed, 400) // 100 units in 250 ms
    assert.equal(t[0].amp, 0) // the start has no stroke into it
  })

  it('places a turn where the stroke arrives, not where a flat stretch ends', () => {
    const a = cleanActions([
      { at: 0, pos: 90 },
      { at: 300, pos: 10 },
      { at: 600, pos: 10 },
      { at: 900, pos: 90 },
      { at: 1000, pos: 90 },
      { at: 1300, pos: 10 },
    ])
    assert.equal(kinds(turningPoints(a)), 't0 b300 t900 b1300')
  })

  it('ignores wiggles smaller than the threshold', () => {
    const a = cleanActions([
      { at: 0, pos: 0 },
      { at: 100, pos: 50 },
      { at: 150, pos: 47 }, // a shake on the way up
      { at: 200, pos: 100 },
      { at: 400, pos: 2 },
      { at: 450, pos: 4 }, // and at the bottom
      { at: 500, pos: 0 },
      { at: 700, pos: 100 },
    ])
    const t = turningPoints(a, 5)
    assert.equal(kinds(t), 'b0 t200 b500 t700')
    assert.equal(t[2].pos, 0)
  })

  it('starts with whichever way the script first moves', () => {
    const a = cleanActions([{ at: 0, pos: 50 }, { at: 100, pos: 52 }, { at: 200, pos: 20 }, { at: 400, pos: 80 }])
    assert.equal(kinds(turningPoints(a)), 't100 b200 t400')
  })

  it('alternates, and keeps the amplitude and speed of each stroke', () => {
    const a = cleanActions([
      { at: 0, pos: 20 },
      { at: 500, pos: 80 },
      { at: 700, pos: 50 },
      { at: 1000, pos: 90 },
    ])
    const t = turningPoints(a)
    assert.equal(kinds(t), 'b0 t500 b700 t1000')
    for (let i = 1; i < t.length; i++)
      assert.notEqual(t[i].kind, t[i - 1].kind)
    assert.equal(t[2].amp, 30)
    assert.equal(t[2].speed, 150)
  })

  it('finds nothing in a flat or tiny script', () => {
    assert.deepEqual(turningPoints([]), [])
    assert.deepEqual(turningPoints([{ at: 0, pos: 50 }]), [])
    assert.deepEqual(turningPoints(cleanActions([{ at: 0, pos: 50 }, { at: 100, pos: 52 }, { at: 200, pos: 49 }])), [])
  })
})

describe('reading a script at a time', () => {
  const a = cleanActions([{ at: 0, pos: 0 }, { at: 1000, pos: 100 }, { at: 2000, pos: 0 }])

  it('binary-searches the first point at or after a time', () => {
    assert.equal(firstAtOrAfter(a, -5), 0)
    assert.equal(firstAtOrAfter(a, 0), 0)
    assert.equal(firstAtOrAfter(a, 1), 1)
    assert.equal(firstAtOrAfter(a, 1000), 1)
    assert.equal(firstAtOrAfter(a, 2500), 3)
  })

  it('interpolates the position, and holds it outside the script', () => {
    assert.equal(positionAt(a, 500), 50)
    assert.equal(positionAt(a, 1500), 50)
    assert.equal(positionAt(a, -100), 0)
    assert.equal(positionAt(a, 9000), 0)
    assert.equal(positionAt([], 0), null)
  })

  it('cuts out the path of a window, with both ends', () => {
    assert.deepEqual(pathBetween(a, 500, 1500), [{ at: 500, pos: 50 }, { at: 1000, pos: 100 }, { at: 1500, pos: 50 }])
    assert.deepEqual(pathBetween(a, 1000, 1200), [{ at: 1000, pos: 100 }, { at: 1200, pos: 80 }])
    assert.deepEqual(pathBetween(a, 100, 100), [])
  })

  it('counts strokes a minute around a moment', () => {
    // A bottom every 500 ms: 120 a minute.
    const pts = Array.from({ length: 41 }, (_, i) => ({ at: i * 250, pos: i % 2 ? 100 : 0 }))
    const t = turningPoints(cleanActions(pts))
    assert.equal(Math.round(spmAround(t, 5000)), 120)
    assert.equal(spmAround(t, 60_000), 0)
  })
})
