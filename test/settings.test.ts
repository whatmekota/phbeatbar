import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { effectiveConfig, FIELDS, LOOK_KEYS, matchesLook, PRESETS, readConfig, usePortrait } from '../src/settings.ts'

const defaults = Object.fromEntries(FIELDS.filter(f => f.key).map(f => [f.key, (f as { default?: unknown }).default]))

describe('settings', () => {
  it('starts with stroke tops off, Auto video shape and the user\'s own look', () => {
    const c = readConfig(defaults)
    assert.equal(c.tops, false)
    assert.equal(c.layout, 'auto')
    assert.equal(c.look, 'custom')
    assert.equal(c.tick, false)
  })

  it('takes nothing it doesn\'t know', () => {
    const c = readConfig({ side: 'middle', shape: 'cat', length: 500, volume: -3 })
    assert.equal(c.side, 'bottom')
    assert.equal(c.shape, 'circle')
    assert.equal(c.length, 1)
    assert.equal(c.volume, 0)
  })

  it('has looks that set only form values the form offers', () => {
    const keys = new Set(FIELDS.map(f => f.key))
    for (const look of Object.values(PRESETS)) {
      assert.deepEqual(Object.keys(look).sort(), [...LOOK_KEYS].sort())
      for (const [k, v] of Object.entries(look)) {
        assert.ok(keys.has(k), k)
        const field = FIELDS.find(f => f.key === k)!
        if (field.type === 'select' && Array.isArray(field.options))
          assert.ok(field.options.some(o => o.value === v), `${k}=${String(v)}`)
      }
    }
  })

  it('reproduces the three reference bars', () => {
    const classic = readConfig({ ...defaults, ...PRESETS.classic })
    assert.deepEqual([classic.hit, classic.ring, classic.length, classic.strip], ['centre', 'pointer', 1, false])
    const hearts = readConfig({ ...defaults, ...PRESETS.hearts })
    assert.deepEqual([hearts.hit, hearts.shape, hearts.ring, hearts.strip, hearts.colour], ['start', 'heart', 'none', true, 'pink'])
    const portrait = readConfig({ ...defaults, ...PRESETS.portrait })
    assert.deepEqual([portrait.align, portrait.length, portrait.colour, portrait.ring], ['start', 0.5, 'white', 'ring'])
  })

  it('knows when the values still are a look', () => {
    const v = { ...defaults, ...PRESETS.hearts }
    assert.equal(matchesLook('hearts', v), true)
    assert.equal(matchesLook('hearts', { ...v, shape: 'star' }), false)
    assert.equal(matchesLook('classic', v), false)
  })

  it('picks the Portrait look for a tall video in Auto, and lets it be forced', () => {
    const tall = { w: 1080, h: 1920 }
    const wide = { w: 1920, h: 1080 }
    assert.equal(usePortrait('auto', tall), true)
    assert.equal(usePortrait('auto', wide), false)
    assert.equal(usePortrait('auto', null), false)
    assert.equal(usePortrait('landscape', tall), false)
    assert.equal(usePortrait('portrait', wide), true)
  })

  it('draws a tall video with the Portrait look over the user\'s, keeping the rest', () => {
    const mine = { ...defaults, ...PRESETS.hearts, look: 'hearts', lookahead: 5, tick: true }
    const tall = effectiveConfig(mine, { w: 720, h: 1280 })
    assert.equal(tall.shape, 'circle')
    assert.equal(tall.colour, 'white')
    assert.equal(tall.lookaheadS, 5)
    assert.equal(tall.tick, true)
    assert.equal(effectiveConfig(mine, { w: 1280, h: 720 }).shape, 'heart')
  })
})
