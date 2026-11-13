import type { Align, Side } from './layout'
import type { Sound } from './metronome'
import type { Shape } from './shapes'
import type { SettingField } from './types'

export type Style = 'meter' | 'guide'
export type Hit = 'start' | 'centre'
export type Colour = 'speed' | 'accent' | 'white' | 'pink'
export type Ring = 'ring' | 'pointer' | 'none'
export type Look = 'custom' | 'classic' | 'hearts'
export type EdgeMode = 'show' | 'hide'

export interface Config {
  visible: boolean
  look: Look
  style: Style
  side: Side
  align: Align
  /** 0.2–1 of the side. */
  length: number
  /** 1 = normal. */
  scale: number
  /** 0–1. */
  opacity: number
  strip: boolean
  hit: Hit
  shape: Shape
  colour: Colour
  sizeByDepth: boolean
  /** Strokes that travel less than this (funscript units, 0–100) get no beat; 0 marks every stroke. */
  minStroke: number
  ring: Ring
  label: boolean
  lookaheadS: number
  tops: boolean
  generated: boolean
  edges: EdgeMode
  tick: boolean
  sound: Sound
  /** 0–1. */
  volume: number
}

/**
 * What a look sets, as stored setting values. The keys are the bar's look
 * and place; lookahead, the metronome and the rest stay as the user has them.
 */
export const PRESETS: Record<Exclude<Look, 'custom'>, Record<string, unknown>> = {
  // A thin line across the bottom, the beat in the middle under a ring with
  // a pointer: past beats grey on the left, the coming ones pink on the right.
  classic: { style: 'meter', side: 'bottom', align: 'centre', length: 100, size: 80, strip: false, hit: 'centre', shape: 'circle', colour: 'pink', sizeByDepth: false, ring: 'pointer', label: false },
  // Pink hearts in a dark strip along the bottom, landing in a hollow heart
  // at the left end.
  hearts: { style: 'meter', side: 'bottom', align: 'centre', length: 100, size: 110, strip: true, hit: 'start', shape: 'heart', colour: 'pink', sizeByDepth: false, ring: 'ring', label: false },
}
export const LOOK_KEYS = Object.keys(PRESETS.classic)

/** Whether the stored values are exactly what a look sets. */
export function matchesLook(look: Exclude<Look, 'custom'>, v: Record<string, unknown>): boolean {
  return Object.entries(PRESETS[look]).every(([k, want]) => v[k] === want)
}

export const FIELDS: SettingField[] = [
  { key: 'visible', type: 'switch', label: 'Show the beat bar', hint: 'Also Shift+B, or "Show or hide the beat bar" in the command palette (Ctrl K).', default: true },
  {
    key: 'look',
    type: 'select',
    label: 'Look',
    hint: 'A look sets everything under Bar and Beats in one go; change any of them and it becomes Custom.',
    options: [
      { value: 'custom', label: 'Custom' },
      { value: 'classic', label: 'Classic centre: a line, the beat in the middle' },
      { value: 'hearts', label: 'Hearts: a strip of hearts landing in a hollow heart on the left' },
    ],
    default: 'custom',
  },

  { type: 'heading', label: 'Bar' },
  {
    key: 'style',
    type: 'select',
    label: 'Style',
    options: [
      { value: 'meter', label: 'Beat meter: the beats scroll to a hit zone' },
      { value: 'guide', label: 'Stroke guide: where the stroke is, and where it goes next' },
    ],
    default: 'meter',
  },
  {
    key: 'side',
    type: 'select',
    label: 'Edge',
    options: [
      { value: 'bottom', label: 'Bottom' },
      { value: 'top', label: 'Top' },
      { value: 'left', label: 'Left' },
      { value: 'right', label: 'Right' },
    ],
    default: 'bottom',
  },
  {
    key: 'align',
    type: 'select',
    label: 'Along the edge',
    options: [
      { value: 'start', label: 'Left (or top)' },
      { value: 'centre', label: 'Centre' },
      { value: 'end', label: 'Right (or bottom)' },
    ],
    default: 'centre',
  },
  { key: 'length', type: 'slider', label: 'Length', hint: 'How much of the edge it covers; 100% runs across the whole picture.', min: 20, max: 100, step: 5, unit: '%', default: 50 },
  { key: 'size', type: 'slider', label: 'Size', min: 50, max: 200, step: 10, unit: '%', default: 100 },
  { key: 'opacity', type: 'slider', label: 'Opacity', min: 20, max: 100, step: 5, unit: '%', default: 85 },
  { key: 'strip', type: 'switch', label: 'Dark strip behind it', default: true },

  { type: 'heading', label: 'Beats' },
  {
    key: 'hit',
    type: 'select',
    label: 'Where the beat lands',
    options: [
      { value: 'start', label: 'At the start: the first marker is the beat' },
      { value: 'centre', label: 'In the middle: past beats carry on, greyed' },
    ],
    default: 'start',
    when: v => v.style !== 'guide',
  },
  {
    key: 'shape',
    type: 'select',
    label: 'Markers',
    options: [
      { value: 'circle', label: 'Circles' },
      { value: 'heart', label: 'Hearts' },
      { value: 'star', label: 'Stars' },
      { value: 'paw', label: 'Paws' },
      { value: 'diamond', label: 'Diamonds' },
    ],
    default: 'circle',
    when: v => v.style !== 'guide',
  },
  {
    key: 'colour',
    type: 'select',
    label: 'Colour',
    options: [
      { value: 'speed', label: 'By speed (the heatmap\'s colours)' },
      { value: 'accent', label: 'The theme\'s accent' },
      { value: 'pink', label: 'Pink' },
      { value: 'white', label: 'White' },
    ],
    default: 'speed',
  },
  { key: 'sizeByDepth', type: 'switch', label: 'Bigger markers for longer strokes', default: true, when: v => v.style !== 'guide' },
  { key: 'minStroke', type: 'slider', label: 'Skip strokes shorter than', hint: 'A stroke that travels less than this much of the range gets no beat: a small flick or bounce becomes part of the stroke around it. 0% marks every stroke.', min: 0, max: 60, step: 5, unit: '%', default: 0 },
  {
    key: 'ring',
    type: 'select',
    label: 'Hit marker',
    options: [
      { value: 'ring', label: 'An outline of the marker (a ring for circles, a hollow heart for hearts…)' },
      { value: 'pointer', label: 'The outline, with a pointer' },
      { value: 'none', label: 'None: the beat itself pops' },
    ],
    default: 'ring',
    when: v => v.style !== 'guide',
  },
  { key: 'tops', type: 'switch', label: 'Mark the top of each stroke too', hint: 'A thin line between the beats, where the stroke turns at the top.', default: false },
  { key: 'label', type: 'switch', label: 'Show strokes a minute', default: true, when: v => v.style !== 'guide' },
  { key: 'lookahead', type: 'slider', label: 'Lookahead', hint: 'How many seconds ahead the beat meter shows; the stroke guide shows two thirds of it. Less spreads fast strokes out.', min: 1, max: 8, step: 0.5, unit: ' s', default: 3 },
  { key: 'generated', type: 'switch', label: 'Without a script, follow generated motion', hint: 'Music sync, tap tempo or the Manual source: the bar shows the tempo they stroke at.', default: true },
  {
    key: 'edges',
    type: 'select',
    label: 'During an edge',
    hint: 'Needs playhound 2.2 or newer; older ones don\'t tell plugins about edges.',
    options: [
      { value: 'show', label: 'Dim it and count the hold down' },
      { value: 'hide', label: 'Hide it' },
    ],
    default: 'show',
  },

  { type: 'heading', label: 'Metronome' },
  { key: 'tick', type: 'switch', label: 'Tick on each beat', default: false },
  {
    key: 'sound',
    type: 'select',
    label: 'Sound',
    hint: 'Picking one plays it, so you can hear it.',
    options: [
      { value: 'click', label: 'Soft click' },
      { value: 'wood', label: 'Wood block' },
      { value: 'tick', label: 'Tick' },
      { value: 'pop', label: 'Pop' },
    ],
    default: 'click',
  },
  { key: 'volume', type: 'slider', label: 'Volume', min: 5, max: 100, step: 5, unit: '%', default: 25 },
]

const num = (v: unknown, fallback: number, lo: number, hi: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback

/** The settings as the plugin uses them, whatever was stored. */
export function readConfig(v: Record<string, unknown>): Config {
  return {
    visible: v.visible !== false,
    look: oneOf(v.look, ['custom', 'classic', 'hearts'] as const, 'custom'),
    style: oneOf(v.style, ['meter', 'guide'] as const, 'meter'),
    side: oneOf(v.side, ['bottom', 'top', 'left', 'right'] as const, 'bottom'),
    align: oneOf(v.align, ['start', 'centre', 'end'] as const, 'centre'),
    length: num(v.length, 50, 20, 100) / 100,
    scale: num(v.size, 100, 50, 200) / 100,
    opacity: num(v.opacity, 85, 20, 100) / 100,
    strip: v.strip !== false,
    hit: oneOf(v.hit, ['start', 'centre'] as const, 'start'),
    shape: oneOf(v.shape, ['circle', 'heart', 'star', 'paw', 'diamond'] as const, 'circle'),
    colour: oneOf(v.colour, ['speed', 'accent', 'white', 'pink'] as const, 'speed'),
    sizeByDepth: v.sizeByDepth !== false,
    minStroke: num(v.minStroke, 0, 0, 60),
    ring: oneOf(v.ring, ['ring', 'pointer', 'none'] as const, 'ring'),
    label: v.label !== false,
    lookaheadS: num(v.lookahead, 3, 1, 8),
    tops: v.tops === true,
    generated: v.generated !== false,
    edges: oneOf(v.edges, ['show', 'hide'] as const, 'show'),
    tick: v.tick === true,
    sound: oneOf(v.sound, ['click', 'wood', 'tick', 'pop'] as const, 'click'),
    volume: num(v.volume, 25, 0, 100) / 100,
  }
}

/** What 0.2.0's Portrait look set: white dots on the left half, the beat in a ring at the left end. */
const OLD_PORTRAIT: Record<string, unknown> = { style: 'meter', side: 'bottom', align: 'start', length: 50, size: 90, strip: false, hit: 'start', shape: 'circle', colour: 'white', sizeByDepth: false, ring: 'ring', label: false }

/**
 * What to set to bring 0.2.0's settings up to date. Its Portrait look and
 * its Video shape setting (Auto, always landscape, always portrait) are
 * gone: a tall video now keeps the user's own settings, fitted to its
 * picture. A picked Portrait look becomes Custom with the values it set;
 * "always the Portrait look" becomes those values too; the shape setting
 * itself is cleared.
 */
export function migrate(v: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (v.layout === 'portrait') {
    for (const [k, want] of Object.entries(OLD_PORTRAIT)) {
      if (v[k] !== want)
        out[k] = want
    }
    out.look = 'custom'
  }
  if (v.look === 'portrait')
    out.look = 'custom'
  if (v.layout !== undefined)
    out.layout = undefined
  return out
}

/**
 * What to set after the settings changed from `prev` to `next`, for the
 * looks: picking a look sets everything it sets (only what differs, so the
 * look itself stays picked); changing one of those by hand afterwards makes
 * the look Custom. Applying a look's own values never counts as a change by
 * hand, as they match it.
 */
export function lookChanges(prev: Record<string, unknown>, next: Record<string, unknown>): Record<string, unknown> {
  const look = next.look as Look
  if (!(look in PRESETS))
    return {}
  const preset = PRESETS[look as Exclude<Look, 'custom'>]
  if (look !== prev.look)
    return Object.fromEntries(Object.entries(preset).filter(([k, want]) => next[k] !== want))
  return matchesLook(look as Exclude<Look, 'custom'>, next) ? {} : { look: 'custom' }
}
