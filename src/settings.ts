import type { Side } from './draw'
import type { SettingField } from './types'

export type Style = 'meter' | 'guide'

export interface Config {
  visible: boolean
  style: Style
  side: Side
  /** 1 = normal. */
  scale: number
  /** 0–1. */
  opacity: number
  lookaheadS: number
  tops: boolean
  generated: boolean
  tick: boolean
  /** 0–1. */
  volume: number
}

export const FIELDS: SettingField[] = [
  { key: 'visible', type: 'switch', label: 'Show the beat bar', hint: 'Also Shift+B, or "Show or hide the beat bar" in the command palette (Ctrl K).', default: true },
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
    label: 'Position',
    options: [
      { value: 'bottom', label: 'Bottom' },
      { value: 'top', label: 'Top' },
      { value: 'left', label: 'Left' },
      { value: 'right', label: 'Right' },
    ],
    default: 'bottom',
  },
  { key: 'size', type: 'slider', label: 'Size', min: 50, max: 200, step: 10, unit: '%', default: 100 },
  { key: 'opacity', type: 'slider', label: 'Opacity', min: 20, max: 100, step: 5, unit: '%', default: 85 },
  { key: 'lookahead', type: 'slider', label: 'Lookahead', hint: 'How many seconds ahead the beat meter shows; the stroke guide shows two thirds of it. Less spreads fast strokes out.', min: 1, max: 8, step: 0.5, unit: ' s', default: 3 },
  { key: 'tops', type: 'switch', label: 'Mark the top of each stroke too', hint: 'A thin line between the beats, where the stroke turns at the top.', default: true },
  { key: 'generated', type: 'switch', label: 'Without a script, follow generated motion', hint: 'Music sync, tap tempo or the Manual source: the bar shows the tempo they stroke at.', default: true },
  { type: 'heading', label: 'Metronome' },
  { key: 'tick', type: 'switch', label: 'Tick on each beat', default: false },
  { key: 'volume', type: 'slider', label: 'Volume', min: 5, max: 100, step: 5, unit: '%', default: 25, when: v => !!v.tick },
]

const num = (v: unknown, fallback: number, lo: number, hi: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback

/** The settings as the plugin uses them, whatever was stored. */
export function readConfig(v: Record<string, unknown>): Config {
  return {
    visible: v.visible !== false,
    style: oneOf(v.style, ['meter', 'guide'] as const, 'meter'),
    side: oneOf(v.side, ['bottom', 'top', 'left', 'right'] as const, 'bottom'),
    scale: num(v.size, 100, 50, 200) / 100,
    opacity: num(v.opacity, 85, 20, 100) / 100,
    lookaheadS: num(v.lookahead, 3, 1, 8),
    tops: v.tops !== false,
    generated: v.generated !== false,
    tick: v.tick === true,
    volume: num(v.volume, 25, 0, 100) / 100,
  }
}
