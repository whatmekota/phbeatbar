import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { FIELDS, LOOK_KEYS, lookChanges, matchesLook, migrate, PRESETS, readConfig } from '../src/settings.ts'

const defaults = Object.fromEntries(FIELDS.filter(f => f.key).map(f => [f.key, (f as { default?: unknown }).default]))

describe('settings', () => {
  it('starts with stroke tops off and the user\'s own look', () => {
    const c = readConfig(defaults)
    assert.equal(c.tops, false)
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

  it('reproduces the reference bars', () => {
    const classic = readConfig({ ...defaults, ...PRESETS.classic })
    assert.deepEqual([classic.hit, classic.ring, classic.length, classic.strip], ['centre', 'pointer', 1, false])
    const hearts = readConfig({ ...defaults, ...PRESETS.hearts })
    assert.deepEqual([hearts.hit, hearts.shape, hearts.ring, hearts.strip, hearts.colour], ['start', 'heart', 'ring', true, 'pink'])
  })

  it('knows when the values still are a look', () => {
    const v = { ...defaults, ...PRESETS.hearts }
    assert.equal(matchesLook('hearts', v), true)
    assert.equal(matchesLook('hearts', { ...v, shape: 'star' }), false)
    assert.equal(matchesLook('classic', v), false)
  })

  it('has no Portrait look or video-shape setting any more', () => {
    assert.equal('portrait' in PRESETS, false)
    assert.equal(FIELDS.some(f => f.key === 'layout'), false)
    const look = FIELDS.find(f => f.key === 'look')!
    assert.ok(look.type === 'select' && Array.isArray(look.options) && !look.options.some(o => o.value === 'portrait'))
    assert.equal(readConfig({ look: 'portrait' }).look, 'custom')
  })
})

/**
 * playhound's settings as a plugin sees them: set() writes at once, and the
 * listeners hear about it a moment later (after the save), with all values.
 */
function fakeSettings(initial: Record<string, unknown>) {
  let values = { ...initial }
  const listeners: ((v: Record<string, unknown>) => void)[] = []
  const set = (k: string, v: unknown) => {
    values = { ...values, [k]: v }
    void Promise.resolve().then(() => listeners.forEach(fn => fn({ ...values })))
  }
  return { set, all: () => ({ ...values }), onChange: (fn: (v: Record<string, unknown>) => void) => listeners.push(fn) }
}

/** The plugin's handler, as in index.ts. */
function wire(s: ReturnType<typeof fakeSettings>) {
  let values = s.all()
  s.onChange((v) => {
    const prev = values
    values = v
    for (const [k, want] of Object.entries(lookChanges(prev, v)))
      s.set(k, want)
  })
}

const settle = () => new Promise(r => setTimeout(r, 10))

describe('picking a look', () => {
  for (const look of ['classic', 'hearts'] as const) {
    it(`keeps ${look} picked once its values are in`, async () => {
      const s = fakeSettings({ ...defaults })
      wire(s)
      s.set('look', look)
      await settle()
      assert.equal(s.all().look, look)
      assert.equal(matchesLook(look, s.all()), true)
    })
  }

  it('keeps it picked going from one look to another', async () => {
    const s = fakeSettings({ ...defaults })
    wire(s)
    s.set('look', 'classic')
    await settle()
    s.set('look', 'hearts')
    await settle()
    assert.equal(s.all().look, 'hearts')
    assert.equal(s.all().ring, 'ring')
  })

  it('turns Custom when something it set is changed by hand', async () => {
    const s = fakeSettings({ ...defaults })
    wire(s)
    s.set('look', 'hearts')
    await settle()
    s.set('shape', 'star')
    await settle()
    assert.equal(s.all().look, 'custom')
    assert.equal(s.all().shape, 'star')
  })

  it('stays picked when a setting it doesn\'t set changes', async () => {
    const s = fakeSettings({ ...defaults })
    wire(s)
    s.set('look', 'hearts')
    await settle()
    s.set('lookahead', 5)
    await settle()
    assert.equal(s.all().look, 'hearts')
  })

  it('gives the Hearts look a hollow heart to land in', () => {
    assert.equal(PRESETS.hearts.shape, 'heart')
    assert.equal(PRESETS.hearts.ring, 'ring')
    assert.deepEqual(lookChanges({ look: 'custom' }, { ...defaults, look: 'custom' }), {})
  })
})

describe('settings from 0.2.0', () => {
  it('leave the Portrait look as Custom, with the values it set', () => {
    const old = { ...defaults, look: 'portrait', layout: 'auto', align: 'start', length: 50, colour: 'white', shape: 'circle' }
    assert.deepEqual(migrate(old), { look: 'custom', layout: undefined })
  })

  it('turn "always the Portrait look" into its values, as Custom', () => {
    const out = migrate({ ...defaults, layout: 'portrait', look: 'hearts', ...PRESETS.hearts })
    assert.equal(out.look, 'custom')
    assert.equal(out.shape, 'circle')
    assert.equal(out.colour, 'white')
    assert.equal(out.align, 'start')
    assert.equal(out.layout, undefined)
    assert.ok('layout' in out)
  })

  it('just clear Auto, keeping the look', () => {
    assert.deepEqual(migrate({ ...defaults, look: 'hearts', layout: 'auto' }), { layout: undefined })
    assert.deepEqual(migrate({ ...defaults, look: 'classic', layout: 'landscape' }), { layout: undefined })
  })

  it('leave settings without them alone', () => {
    assert.deepEqual(migrate({ ...defaults, look: 'hearts' }), {})
  })
})
