import type { Rect, Side } from './layout'
import type { Colour, Hit, Ring } from './settings'
import type { Shape } from './shapes'
import type { Action, Turn } from './turns'
import { heatColor, markerAlpha, markerRadius, markersAt, pulseAt, tailFade, uncertainFade } from './layout'
import { SHAPE_SCALE, shapePath } from './shapes'

/** The theme's colours, read off playhound's CSS variables (a canvas can't use them directly). */
export interface Palette {
  accent: string
  text: string
  bg: string
  border: string
  font: string
}

export interface Frame {
  /** CSS pixels, and the device pixel ratio. */
  w: number
  h: number
  dpr: number
  /** The size setting, 1 = normal. */
  scale: number
  side: Side
  /** Now and the window, in the turns' time (script ms, or real ms for generated motion). */
  now: number
  aheadMs: number
  turns: readonly Turn[]
  showTops: boolean
  /** Strokes a minute, for the label; 0 hides it. */
  spm: number
  colour: Colour
  oklch: boolean
  palette: Palette
  /** Where the row of strokes stops inside the window (rowEnd), or null. */
  rowEndX: number | null
  /** The future is a guess (generated motion): fade the far beats. */
  uncertain: boolean
  /** 1 normally, less while an edge holds back. */
  edgeDim: number
  /** "Edge · 12 s" while an edge holds, else null. */
  edgeText: string | null
}

export interface MeterFrame extends Frame {
  hit: Hit
  shape: Shape
  sizeByDepth: boolean
  ring: Ring
  strip: boolean
  label: boolean
  /** Edge to edge of the picture: square ends. */
  full: boolean
}

export interface GuideFrame extends Frame {
  /** The path from `now` to `now + aheadMs` (or a little either side). */
  path: readonly Action[]
  /** Where the stroke is now, 0–100. */
  posNow: number
}

const FIXED: Record<Exclude<Colour, 'speed' | 'accent'>, string> = { white: '#ffffff', pink: '#ff5c9d' }
/** Past beats, with the beat in the middle. */
const PAST = 'rgb(150,150,160)'

/** A marker's colour: its speed on the heatmap scale, or the one colour chosen. */
export function colourOf(f: Pick<Frame, 'colour' | 'oklch' | 'palette'>, speed: number): string {
  if (f.colour === 'speed')
    return heatColor(speed, f.oklch)
  if (f.colour === 'accent')
    return f.palette.accent
  return FIXED[f.colour]
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)))
}

function background(g: CanvasRenderingContext2D, w: number, h: number, r: number, p: Palette) {
  roundRect(g, 0.5, 0.5, w - 1, h - 1, r)
  g.globalAlpha = 0.72
  g.fillStyle = p.bg
  g.fill()
  g.globalAlpha = 0.9
  g.strokeStyle = p.border
  g.lineWidth = 1
  g.stroke()
  g.globalAlpha = 1
}

/** Text that reads over any picture: the theme's text colour with a soft shadow. */
function caption(g: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, p: Palette, align: CanvasTextAlign) {
  g.font = `600 ${px}px ${p.font}`
  g.textAlign = align
  g.textBaseline = 'middle'
  g.fillStyle = p.text
  g.shadowColor = 'rgba(0,0,0,0.7)'
  g.shadowBlur = 3
  g.globalAlpha = 0.8
  g.fillText(text, x, y)
  g.shadowBlur = 0
  g.globalAlpha = 1
}

/** One marker, `r` from its centre to its edge, at (x, y). */
function marker(g: CanvasRenderingContext2D, shape: Shape, x: number, y: number, r: number, dpr: number, fill: string, alpha: number) {
  const k = r * SHAPE_SCALE[shape]
  g.setTransform(dpr * k, 0, 0, dpr * k, dpr * x, dpr * y)
  const path = shapePath(shape)
  g.globalAlpha = alpha
  g.fillStyle = fill
  g.fill(path)
  g.globalAlpha = alpha * 0.55
  g.strokeStyle = 'rgba(0,0,0,0.6)'
  g.lineWidth = 1 / k
  g.stroke(path)
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
}

/**
 * The beat meter: a track with the hit zone at its start or in its middle.
 * Horizontal (top or bottom of the picture) the beats come in from the
 * right; vertical (left or right) they fall from the top. With the beat at
 * the start, a beat that has landed fades at once; with it in the middle,
 * past beats carry on out the other side, greyed. Everything is placed by
 * `a`, the distance along the track, turned into screen points by `at()`.
 */
export function drawMeter(g: CanvasRenderingContext2D, f: MeterFrame) {
  const { w, h, dpr, palette: p } = f
  const vertical = f.side === 'left' || f.side === 'right'
  const L = vertical ? h : w
  const T = vertical ? w : h
  const mid = T / 2
  const at = (a: number): [number, number] => (vertical ? [mid, h - a] : [a, mid])
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, w, h)
  const radius = f.full ? 0 : T / 2
  if (f.strip)
    background(g, w, h, radius, p)

  // The tempo label has a place of its own at the far end, so beats never run under it.
  const px = Math.round(Math.max(9, 10 * f.scale))
  g.font = `600 ${px}px ${p.font}`
  const room = f.label ? (vertical ? px * 2.2 : g.measureText('000 spm').width + T * 0.3) : 0
  if (f.label && f.spm > 0) {
    if (vertical)
      caption(g, `${Math.round(f.spm)}`, w / 2, room / 2 + 2, px, p, 'center')
    else
      caption(g, `${Math.round(f.spm)} spm`, w - T * 0.3, h / 2 + 0.5, px, p, 'right')
  }

  // Everything else stays inside the bar.
  g.save()
  const clip: Rect = { x: 1, y: 1, w: w - 2, h: h - 2 }
  roundRect(g, clip.x, clip.y, clip.w, clip.h, radius)
  g.clip()

  const edgeA = T * 0.4
  const endA = L - (room ? room + T * 0.15 : edgeA)
  const hitA = f.hit === 'centre' ? Math.max(T * 0.6, (endA + edgeA) / 2) : T * 0.6
  const span = Math.max(1, endA - hitA)
  // Past the hit zone: gone within the start's little room, or all the way out with the beat in the middle.
  const behindX = f.hit === 'centre' ? Math.max(0.01, (hitA - edgeA) / span) : Math.max(0.01, Math.min(0.12, (hitA - 2) / span))
  const maxR = T * 0.34
  const fixedR = maxR * 0.62
  const ringR = f.sizeByDepth ? maxR * 1.12 : maxR * 0.92
  const { pulse, turn: hit } = pulseAt(f.turns, f.now)

  // The line the beats travel along.
  g.strokeStyle = f.strip ? p.text : 'rgb(200,200,210)'
  g.globalAlpha = (f.strip ? 0.14 : 0.35) * f.edgeDim
  g.lineWidth = 1
  g.beginPath()
  g.moveTo(...at(f.hit === 'centre' ? edgeA : hitA))
  g.lineTo(...at(endA))
  g.stroke()

  // The hit zone's flash, under the markers.
  const [hx, hy] = at(hitA)
  if (f.ring !== 'none' && pulse > 0.01 && hit) {
    g.globalAlpha = 0.5 * pulse * f.edgeDim
    g.fillStyle = colourOf(f, hit.speed)
    g.beginPath()
    g.arc(hx, hy, ringR * (0.95 + 0.4 * pulse), 0, Math.PI * 2)
    g.fill()
  }

  for (const m of markersAt(f.turns, f.now, f.aheadMs, f.aheadMs * behindX)) {
    const past = m.x < 0
    let alpha = markerAlpha(m.x, behindX) * tailFade(m.x, f.rowEndX) * (f.uncertain ? uncertainFade(m.x) : 1) * f.edgeDim
    if (past && f.hit === 'centre')
      alpha *= 0.6
    if (alpha <= 0.01)
      continue
    const [x, y] = at(hitA + m.x * span)
    if (m.turn.kind === 'bottom') {
      let r = f.sizeByDepth ? markerRadius(m.turn.amp, maxR) : fixedR
      if (past && f.hit === 'start')
        r *= 1 + (m.x / behindX) * 0.5
      if (m.turn === hit)
        r *= 1 + 0.35 * pulse
      const fill = past && f.hit === 'centre' ? PAST : colourOf(f, m.turn.speed)
      marker(g, f.shape, x, y, Math.max(1, r), dpr, fill, alpha)
    }
    else if (f.showTops) {
      const len = (f.sizeByDepth ? markerRadius(m.turn.amp, maxR) : fixedR) * 0.55
      g.globalAlpha = alpha * 0.5
      g.strokeStyle = p.text
      g.lineWidth = Math.max(1.5, 2 * f.scale)
      g.lineCap = 'round'
      g.beginPath()
      if (vertical) {
        g.moveTo(x - len, y)
        g.lineTo(x + len, y)
      }
      else {
        g.moveTo(x, y - len)
        g.lineTo(x, y + len)
      }
      g.stroke()
    }
  }

  // The hit zone itself, on top: a ring, and maybe a pointer at it from the outer side.
  if (f.ring !== 'none') {
    const plain = f.colour === 'speed' || f.colour === 'accent' ? p.accent : '#ffffff'
    g.globalAlpha = (0.65 + 0.35 * pulse) * Math.max(0.5, f.edgeDim)
    g.strokeStyle = pulse > 0.01 ? '#ffffff' : plain
    g.lineWidth = Math.max(1.5, 2 * f.scale)
    g.beginPath()
    g.arc(hx, hy, ringR * (1 + 0.15 * pulse), 0, Math.PI * 2)
    g.stroke()
    if (f.ring === 'pointer') {
      const gap = ringR + T * 0.04
      const len = T * 0.13
      const half = T * 0.09
      g.fillStyle = '#ffffff'
      g.beginPath()
      if (vertical) {
        g.moveTo(hx - gap, hy)
        g.lineTo(hx - gap - len, hy - half)
        g.lineTo(hx - gap - len, hy + half)
      }
      else {
        g.moveTo(hx, hy + gap)
        g.lineTo(hx - half, hy + gap + len)
        g.lineTo(hx + half, hy + gap + len)
      }
      g.closePath()
      g.fill()
    }
  }
  g.restore()
  g.globalAlpha = 1

  if (f.edgeText)
    caption(g, f.edgeText, w / 2, h / 2, Math.round(Math.max(10, 12 * f.scale)), p, 'center')
}

/**
 * The stroke guide: a vertical gauge with a puck where the stroke is now
 * (top of the gauge is the top of the stroke), and beside it the path of the
 * next few seconds, coloured by speed, coming toward the gauge. The gauge
 * sits on the picture's edge side: on the right for `right`, else on the left.
 */
export function drawGuide(g: CanvasRenderingContext2D, f: GuideFrame) {
  const { w, h, dpr, palette: p } = f
  const s = f.scale
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, w, h)
  background(g, w, h, Math.min(14 * s, h / 2), p)
  // Mirror for the right side, so the path always runs away from the edge.
  if (f.side === 'right')
    g.setTransform(-dpr, 0, 0, dpr, w * dpr, 0)

  const pad = 10 * s
  const top = pad + 4 * s
  const bottom = h - pad - 4 * s
  const y = (pos: number) => top + (1 - pos / 100) * (bottom - top)
  const gaugeW = 26 * s
  const gx = pad + gaugeW / 2
  const x0 = pad + gaugeW + 8 * s
  const x1 = w - pad
  const x = (t: number) => x0 + ((t - f.now) / f.aheadMs) * (x1 - x0)
  const { pulse } = pulseAt(f.turns, f.now)

  // Bottom, middle and top lines across the path.
  g.strokeStyle = p.text
  g.lineWidth = 1
  g.globalAlpha = 0.08
  g.beginPath()
  for (const pos of [0, 50, 100]) {
    g.moveTo(x0, Math.round(y(pos)) + 0.5)
    g.lineTo(x1, Math.round(y(pos)) + 0.5)
  }
  g.stroke()

  // The rail, and the range the coming strokes cover on it.
  const railW = 8 * s
  g.globalAlpha = 0.16
  g.fillStyle = p.text
  roundRect(g, gx - railW / 2, top, railW, bottom - top, railW / 2)
  g.fill()
  let lo = 100
  let hi = 0
  for (const a of f.path) {
    if (a.at < f.now || a.at > f.now + f.aheadMs)
      continue
    lo = Math.min(lo, a.pos)
    hi = Math.max(hi, a.pos)
  }
  if (hi > lo) {
    g.globalAlpha = 0.45
    g.fillStyle = p.accent
    roundRect(g, gx - railW / 2, y(hi), railW, y(lo) - y(hi), railW / 2)
    g.fill()
  }

  // The path, a segment at a time in its speed's colour, fading toward the far end.
  g.lineWidth = Math.max(1.5, 2.5 * s)
  g.lineCap = 'round'
  g.lineJoin = 'round'
  let speedNow = 0
  for (let i = 1; i < f.path.length; i++) {
    const a = f.path[i - 1]
    const b = f.path[i]
    if (b.at <= f.now || a.at >= f.now + f.aheadMs || b.at <= a.at)
      continue
    const speed = (Math.abs(b.pos - a.pos) / (b.at - a.at)) * 1000
    if (a.at <= f.now)
      speedNow = speed
    // Clip the segment to the window.
    const ta = Math.max(a.at, f.now)
    const tb = Math.min(b.at, f.now + f.aheadMs)
    const pa = a.pos + ((b.pos - a.pos) * (ta - a.at)) / (b.at - a.at)
    const pb = a.pos + ((b.pos - a.pos) * (tb - a.at)) / (b.at - a.at)
    const tx = (ta - f.now) / f.aheadMs
    g.globalAlpha = markerAlpha(tx, 0) * tailFade(tx, f.rowEndX) * (f.uncertain ? uncertainFade(tx) : 1) * f.edgeDim * 0.95
    g.strokeStyle = colourOf(f, speed)
    g.beginPath()
    g.moveTo(x(ta), y(pa))
    g.lineTo(x(tb), y(pb))
    g.stroke()
  }

  // Beats on the path: a dot at each bottom.
  for (const m of markersAt(f.turns, f.now, f.aheadMs)) {
    if (m.turn.kind !== 'bottom' && !f.showTops)
      continue
    const alpha = markerAlpha(m.x, 0) * tailFade(m.x, f.rowEndX) * (f.uncertain ? uncertainFade(m.x) : 1) * f.edgeDim
    if (alpha <= 0)
      continue
    g.globalAlpha = alpha
    g.fillStyle = m.turn.kind === 'bottom' ? colourOf(f, m.turn.speed) : p.text
    g.beginPath()
    g.arc(x(m.turn.at), y(m.turn.pos), (m.turn.kind === 'bottom' ? 3.5 : 2) * s, 0, Math.PI * 2)
    g.fill()
  }

  // From the puck to where the path starts.
  const py = y(f.posNow)
  g.globalAlpha = 0.35
  g.strokeStyle = p.text
  g.lineWidth = 1
  g.setLineDash([2 * s, 3 * s])
  g.beginPath()
  g.moveTo(gx + gaugeW / 2, py)
  g.lineTo(x0, py)
  g.stroke()
  g.setLineDash([])

  // The puck: where the stroke is now, flashing on the beat.
  const pw = gaugeW * (1 + 0.15 * pulse)
  const ph = 9 * s * (1 + 0.3 * pulse)
  g.globalAlpha = 1
  if (pulse > 0.01) {
    g.shadowColor = colourOf(f, speedNow)
    g.shadowBlur = 14 * s * pulse
  }
  g.fillStyle = colourOf(f, speedNow)
  roundRect(g, gx - pw / 2, py - ph / 2, pw, ph, ph / 2)
  g.fill()
  g.shadowBlur = 0
  g.strokeStyle = p.text
  g.globalAlpha = 0.85
  g.lineWidth = 1.5
  g.stroke()
  g.globalAlpha = 1
  if (f.edgeText) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    caption(g, f.edgeText, w / 2, h / 2, Math.round(Math.max(10, 12 * s)), p, 'center')
  }
}
