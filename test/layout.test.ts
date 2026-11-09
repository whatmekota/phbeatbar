import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { aheadInScript, barRect, EDGE_GAP, meterTrack, MIN_WINDOW_S, uncrowdedWindow, windowFor, heatColor, markerAlpha, markerRadius, markersAt, pulseAt, rowEnd, scriptTime, tailFade, uncertainFade } from '../src/layout.ts'
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

describe('where the row stops', () => {
  it('is nowhere while strokes carry on past the window', () => {
    assert.equal(rowEnd(turns, 1000, 1000), null)
  })

  it('is the last stroke when the script ends inside the window', () => {
    // The last turn is at 10 000 ms.
    assert.equal(rowEnd(turns, 9000, 2000), 0.5)
  })

  it('is the last stroke before a long pause', () => {
    const gap = turningPoints(cleanActions([
      ...Array.from({ length: 9 }, (_, i) => ({ at: i * 250, pos: i % 2 ? 100 : 0 })),
      { at: 6000, pos: 100 },
      { at: 6250, pos: 0 },
      { at: 6500, pos: 100 },
    ]))
    assert.equal(rowEnd(gap, 1000, 2000), 0.5) // the turn at 2000
    assert.equal(rowEnd(gap, 0, 1000), null) // still strokes beyond this window
  })

  it('fades the end of a stopping row, keeping the near ones solid', () => {
    assert.equal(tailFade(0.2, null), 1)
    assert.equal(tailFade(0, 0.1), 1)
    assert.equal(tailFade(0.1, 0.6), 1)
    const a = tailFade(0.4, 0.6)
    const b = tailFade(0.6, 0.6)
    assert.ok(a < 1 && b < a && b >= 0.15)
  })

  it('fades guessed beats with distance', () => {
    assert.equal(uncertainFade(0.2), 1)
    assert.ok(uncertainFade(0.7) < 1)
    assert.equal(+uncertainFade(1).toFixed(3), 0.15)
    assert.ok(uncertainFade(0.9) < uncertainFade(0.6))
  })
})

describe('placing the bar', () => {
  const layer = { x: 0, y: 0, w: 1600, h: 900 }
  const base = { side: 'bottom', align: 'centre', length: 0.5, thickness: 50, insetTop: 0, insetBottom: 0 } as const

  it('centres a half-length bar along the bottom, clear of the edge', () => {
    const r = barRect(layer, 900, base)
    assert.equal(r.w, (1600 - 24) * 0.5)
    assert.equal(r.x, (1600 - r.w) / 2)
    assert.equal(r.y, 900 - EDGE_GAP - 50)
    assert.equal(r.full, false)
  })

  it('runs edge to edge at full length', () => {
    const r = barRect(layer, 900, { ...base, length: 1 })
    assert.deepEqual([r.x, r.w, r.full], [0, 1600, true])
  })

  it('sits at the start or the end of its edge', () => {
    assert.equal(barRect(layer, 900, { ...base, align: 'start' }).x, EDGE_GAP)
    const end = barRect(layer, 900, { ...base, align: 'end' })
    assert.equal(end.x + end.w, 1600 - EDGE_GAP)
  })

  it('keeps clear of the player\'s bars', () => {
    assert.equal(barRect(layer, 900, { ...base, insetBottom: 116 }).y, 900 - 116 - EDGE_GAP - 50)
    assert.equal(barRect(layer, 900, { ...base, side: 'top', insetTop: 64 }).y, 64 + EDGE_GAP)
  })

  it('stays over a pillarboxed picture, not the black bars', () => {
    // A tall video in a wide player: the picture is 506 px wide in the middle.
    const picture = { x: 547, y: 0, w: 506, h: 900 }
    const r = barRect(picture, 900, { ...base, align: 'start', length: 0.5 })
    assert.equal(r.x, 547 + EDGE_GAP)
    assert.equal(r.w, (506 - 24) * 0.5)
    const full = barRect(picture, 900, { ...base, length: 1 })
    assert.deepEqual([full.x, full.w], [547, 506])
  })

  it('stands on the left or right, its length taken from the height left free', () => {
    const r = barRect(layer, 900, { ...base, side: 'left', length: 1, insetTop: 64, insetBottom: 100 })
    assert.deepEqual([r.x, r.y, r.w, r.h], [EDGE_GAP, 64, 50, 900 - 64 - 100])
    const right = barRect(layer, 900, { ...base, side: 'right', align: 'start' })
    assert.equal(right.x, 1600 - EDGE_GAP - 50)
    assert.equal(right.y, EDGE_GAP)
  })
})

describe('the window on a narrow picture', () => {
  // A 16:9 video 1332×749, and a 9:16 one of the same height, 421 px wide.
  const wide = { x: 0, y: 0, w: 1332, h: 749 }
  const tall = { x: 455, y: 0, w: 749 * 9 / 16, h: 749 }
  const base = { side: 'bottom', align: 'centre', thickness: 50, insetTop: 0, insetBottom: 0 } as const
  /** Pixels a second the beats move at: the bar's run over the window. */
  const pxPerS = (picture: typeof wide, length: number, lookahead: number) => {
    const bar = barRect(picture, 749, { ...base, length })
    return bar.w / windowFor(lookahead, bar, picture, { side: 'bottom', length })
  }

  it('keeps the whole lookahead on a wide picture', () => {
    const bar = barRect(wide, 749, { ...base, length: 1 })
    assert.equal(windowFor(3, bar, wide, { side: 'bottom', length: 1 }), 3)
  })

  it('shrinks it on a tall one, so the beats keep their spacing', () => {
    for (const length of [1, 0.8]) {
      const a = pxPerS(wide, length, 8)
      const b = pxPerS(tall, length, 8)
      assert.ok(Math.abs(a - b) / a < 0.02, `${length}: ${a} vs ${b}`)
    }
  })

  it('never looks less than 1.5 s ahead, so a beat stays in sight', () => {
    const bar = barRect(tall, 749, { ...base, length: 0.3 })
    assert.equal(windowFor(3, bar, tall, { side: 'bottom', length: 0.3 }), MIN_WINDOW_S)
    // …unless the lookahead itself is shorter.
    assert.equal(windowFor(1, bar, tall, { side: 'bottom', length: 0.3 }), 1)
  })

  it('leaves a bar on the left or right alone: the height is the same', () => {
    const bar = barRect(tall, 749, { ...base, side: 'left', length: 1 })
    assert.equal(windowFor(3, bar, tall, { side: 'left', length: 1 }), 3)
  })

  it('keeps beats at 180 strokes a minute apart on a tall picture', () => {
    // A full-width bar on a 9:16 picture, a beat every 333 ms.
    const bar = barRect(tall, 749, { ...base, length: 1 })
    const w = windowFor(3, bar, tall, { side: 'bottom', length: 1 })
    const gapPx = (bar.w / (w * 1000)) * 333
    assert.ok(gapPx > 40, `${gapPx}`)
  })
})

describe('keeping beats apart on a short bar', () => {
  it('leaves the window alone when the beats fit', () => {
    // 120 a minute over 600 px in 3 s: 100 px apart.
    assert.equal(uncrowdedWindow(3000, 600, 500, 30), 3000)
  })

  it('cuts it so the beats stay at least the gap apart', () => {
    // 180 a minute on a 100 px track, 30 px gaps wanted: 3.3 beats, 1111 ms.
    const w = uncrowdedWindow(3000, 100, 333.3, 30)
    assert.ok(Math.abs(w - 1111) < 1)
    assert.ok((100 / w) * 333.3 >= 30 - 1e-9)
  })

  it('always keeps the next beat in sight', () => {
    assert.equal(uncrowdedWindow(3000, 20, 500, 30), 600)
  })

  it('does nothing without a tempo', () => {
    assert.equal(uncrowdedWindow(3000, 100, 0, 30), 3000)
  })

  it('measures the track as the meter lays it out', () => {
    const plain = meterTrack(600, 50, { centre: false, label: false, markerR: 10 })
    assert.equal(plain.spanPx, 600 - 20 - 30)
    assert.equal(plain.minGapPx, 28)
    assert.ok(meterTrack(600, 50, { centre: false, label: true, markerR: 10 }).spanPx < plain.spanPx)
    assert.equal(meterTrack(600, 50, { centre: true, label: false, markerR: 10 }).spanPx, plain.spanPx / 2)
  })
})
