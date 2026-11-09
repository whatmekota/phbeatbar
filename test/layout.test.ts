import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { aheadInScript, heatColor, markerAlpha, markerRadius, markersAt, pulseAt, scriptTime } from '../src/layout.ts'
import { cleanActions, turningPoints } from '../src/turns.ts'

// Bottoms at 0, 500, 1000…, tops between; full strokes.
const turns = turningPoints(cleanActions(Array.from({ length: 41 }, (_, i) => ({ at: i * 250, pos: i % 2 ? 100 : 0 }))))

describe('markers over time', () => {
  it('places the window\'s turns from the hit zone (0) to the far end (1)', () => {
    const m = markersAt(turns, 1000, 1000)
    assert.deepEqual(m.map(x => [x.turn.at, x.x]), [[1000, 0], [1250, 0.25], [1500, 0.5], [1750, 0.75], [2000, 1]])
  })

  it('moves them toward the hit zone as time goes on, keeping their spacing', () => {
    const a = markersAt(turns, 1000, 1000).map(m => m.x)
    const b = markersAt(turns, 1100, 1000).map(m => m.x)
    assert.deepEqual(b.slice(0, 3).map(x => +x.toFixed(3)), [0.15, 0.4, 0.65])
    assert.equal(+(a[1] - a[0]).toFixed(3), +(b[1] - b[0]).toFixed(3))
  })

  it('keeps those just past the hit zone, below 0', () => {
    const m = markersAt(turns, 1100, 1000, 200)
    assert.equal(m[0].turn.at, 1000)
    assert.equal(+m[0].x.toFixed(3), -0.1)
  })

  it('shows nothing without a window or past the script', () => {
    assert.deepEqual(markersAt(turns, 0, 0), [])
    assert.deepEqual(markersAt(turns, 60_000, 3000), [])
    assert.deepEqual(markersAt([], 0, 3000), [])
  })

  it('fades markers in at the far end and out once past', () => {
    assert.equal(markerAlpha(0.5, 0.1), 1)
    assert.equal(markerAlpha(0, 0.1), 1)
    assert.ok(markerAlpha(0.95, 0.1) < 0.5)
    assert.equal(markerAlpha(1.01, 0.1), 0)
    assert.equal(+markerAlpha(-0.05, 0.1).toFixed(3), 0.5)
    assert.equal(markerAlpha(-0.2, 0.1), 0)
  })

  it('sizes a marker by stroke length', () => {
    assert.equal(markerRadius(100, 10), 10)
    assert.equal(markerRadius(0, 10), 4)
    assert.ok(markerRadius(50, 10) > markerRadius(20, 10))
    assert.equal(markerRadius(500, 10), 10)
  })
})

describe('the beat pulse', () => {
  it('flashes as a bottom lands and fades after', () => {
    assert.equal(pulseAt(turns, 1000).pulse, 1)
    const later = pulseAt(turns, 1100).pulse
    assert.ok(later > 0 && later < 1)
    assert.equal(pulseAt(turns, 1300).pulse, 0)
    assert.equal(pulseAt(turns, 1100).turn?.at, 1000)
  })

  it('ignores tops, and is quiet before the first beat', () => {
    // 1250 is a top: the last bottom (1000) has faded by then.
    assert.equal(pulseAt(turns, 1260).pulse, 0)
    assert.equal(pulseAt(turns, -10).pulse, 0)
    assert.equal(pulseAt(turns, -10).turn, null)
  })

  it('flashes less for a shallow stroke', () => {
    const shallow = turningPoints(cleanActions([{ at: 0, pos: 50 }, { at: 100, pos: 60 }, { at: 200, pos: 50 }]))
    assert.ok(pulseAt(shallow, 200).pulse < 0.6)
  })
})

describe('time', () => {
  it('runs the script its offset ahead of the clock', () => {
    assert.equal(scriptTime(10, 0), 10_000)
    assert.equal(scriptTime(10, 150), 10_150)
    assert.equal(scriptTime(10, -50), 9950)
  })

  it('covers more script in the lookahead at a higher speed', () => {
    assert.equal(aheadInScript(3, 1), 3000)
    assert.equal(aheadInScript(3, 2), 6000)
    assert.equal(aheadInScript(3, 0.5), 1500)
    assert.equal(aheadInScript(3, 0), 3000)
    assert.equal(aheadInScript(3, Number.NaN), 3000)
  })
})

describe('heatmap colours', () => {
  it('goes from blue when slow toward red when fast', () => {
    assert.equal(heatColor(0), 'oklch(80% 0.400 210 / 1)')
    assert.equal(heatColor(240), 'oklch(80% 0.400 110 / 1)')
    assert.match(heatColor(480), /oklch\(80% 0\.400 10 /)
  })

  it('darkens past 500 and greys past 800', () => {
    assert.match(heatColor(600), /^oklch\(40% 0\.400 /)
    assert.match(heatColor(900), /^oklch\(40% 0\.100 /)
  })

  it('has an hsl form for canvases without oklch', () => {
    assert.equal(heatColor(0, false, 0.5), 'hsla(210,85%,60.0%,0.5)')
  })
})
