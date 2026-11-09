import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { bounds, outlineReach, SHAPE_SCALE, shapeOps, SHAPES } from '../src/shapes.ts'

describe('marker shapes', () => {
  it('each fits the unit square round its centre', () => {
    for (const s of SHAPES) {
      const b = bounds(shapeOps(s))
      for (const v of [b.minX, b.minY, b.maxX, b.maxY])
        assert.ok(Math.abs(v) <= 1 + 1e-9, `${s}: ${JSON.stringify(b)}`)
      // And fills a fair part of it, so none comes out tiny.
      assert.ok(b.maxX - b.minX >= 1.5 && b.maxY - b.minY >= 1.5, s)
    }
  })

  it('is mirror-symmetric left to right', () => {
    for (const s of SHAPES) {
      const b = bounds(shapeOps(s))
      assert.ok(Math.abs(b.minX + b.maxX) < 1e-6, s)
    }
  })

  it('draws a five-pointed star with its first tip straight up', () => {
    const ops = shapeOps('star')
    const points = ops.filter(o => o[0] === 'M' || o[0] === 'L')
    assert.equal(points.length, 10)
    assert.deepEqual(points[0], ['M', 0, -1])
    assert.equal(ops[ops.length - 1][0], 'Z')
  })

  it('points the heart down and the paw\'s toes up', () => {
    const heart = shapeOps('heart')
    assert.deepEqual(heart[0], ['M', 0, 0.92]) // the tip, at the bottom
    const paw = shapeOps('paw').filter(o => o[0] === 'E')
    assert.equal(paw.length, 5)
    const [pad, ...toes] = paw
    for (const t of toes)
      assert.ok(t[2] < pad[2])
  })

  it('draws the smaller-looking shapes a little bigger', () => {
    assert.equal(SHAPE_SCALE.circle, 1)
    for (const s of SHAPES)
      assert.ok(SHAPE_SCALE[s] >= 1 && SHAPE_SCALE[s] < 1.4)
  })
})

describe('the hit marker\'s outline', () => {
  it('reaches as far as the shape does, scaled like a marker', () => {
    assert.equal(outlineReach('circle', 10, 'below'), 10)
    assert.equal(outlineReach('circle', 10, 'left'), 10)
    assert.equal(+outlineReach('heart', 10, 'below').toFixed(3), +(10 * SHAPE_SCALE.heart * 0.92).toFixed(3))
    assert.equal(+outlineReach('diamond', 10, 'left').toFixed(3), +(10 * SHAPE_SCALE.diamond * 0.78).toFixed(3))
  })

  it('puts a pointer clear of every shape, and no further than the shape\'s box', () => {
    for (const s of SHAPES) {
      for (const side of ['below', 'left'] as const) {
        const reach = outlineReach(s, 10, side)
        assert.ok(reach > 5 && reach <= 10 * SHAPE_SCALE[s] + 1e-9, `${s} ${side}: ${reach}`)
      }
    }
  })
})
