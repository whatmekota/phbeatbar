import type { Action, Turn } from './turns'
import { heatColor, markerAlpha, markerRadius, markersAt, pulseAt } from './layout'

/** The theme's colours, read off playhound's CSS variables (a canvas can't use them directly). */
export interface Palette {
  accent: string
  text: string
  bg: string
  border: string
  font: string
}

export type Side = 'top' | 'bottom' | 'left' | 'right'

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
  oklch: boolean
  palette: Palette
}

export interface GuideFrame extends Frame {
  /** The path from `now` to `now + aheadMs` (or a little either side). */
  path: readonly Action[]
  /** Where the stroke is now, 0–100. */
  posNow: number
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2))
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

/**
 * The beat meter: a track with the hit zone at one end. Horizontal (top or
 * bottom of the picture) the beats come in from the right to a hit zone on
 * the left; vertical (left or right) they fall to a hit zone at the bottom.
 * Drawn in track coordinates: `a` along the track from the hit zone's end,
 * `c` across it.
 */
export function drawMeter(g: CanvasRenderingContext2D, f: Frame) {
  const { w, h, dpr, palette: p } = f
  const vertical = f.side === 'left' || f.side === 'right'
  const L = vertical ? h : w
  const T = vertical ? w : h
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, w, h)
  const radius = T / 2
  background(g, w, h, radius, p)

  // The tempo label has a place of its own at the far end, so beats never run under it.
  const px = Math.round(Math.max(9, 10 * f.scale))
  g.font = `600 ${px}px ${p.font}`
  const labelRoom = vertical ? px * 2.2 : g.measureText('000 spm').width + T * 0.3
  if (f.spm > 0) {
    g.fillStyle = p.text
    g.globalAlpha = 0.6
    if (vertical) {
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(`${Math.round(f.spm)}`, w / 2, labelRoom / 2 + 2)
    }
    else {
      g.textAlign = 'right'
      g.textBaseline = 'middle'
      g.fillText(`${Math.round(f.spm)} spm`, w - T * 0.32, h / 2 + 0.5)
    }
    g.globalAlpha = 1
  }

  // Everything else stays inside the track.
  g.save()
  roundRect(g, 1, 1, w - 2, h - 2, radius)
  g.clip()
  // Along → screen: right on a horizontal track, up on a vertical one.
  if (vertical)
    g.setTransform(0, -dpr, dpr, 0, 0, h * dpr)

  const hitA = T * 0.6
  const endA = L - labelRoom - T * 0.15
  const span = endA - hitA
  const mid = T / 2
  const maxR = T * 0.34
  // Past the hit zone a marker fades out before it reaches the track's end.
  const behindX = Math.max(0.01, Math.min(0.12, (hitA - 2) / span))
  const { pulse, turn: hit } = pulseAt(f.turns, f.now)

  // The line the beats travel along.
  g.strokeStyle = p.text
  g.globalAlpha = 0.14
  g.lineWidth = 1
  g.beginPath()
  g.moveTo(hitA, mid)
  g.lineTo(endA, mid)
  g.stroke()

  // The hit zone's flash, under the markers.
  if (pulse > 0.01 && hit) {
    g.globalAlpha = 0.55 * pulse
    g.fillStyle = heatColor(hit.speed, f.oklch)
    g.beginPath()
    g.arc(hitA, mid, maxR * (1.05 + 0.45 * pulse), 0, Math.PI * 2)
    g.fill()
  }

  for (const m of markersAt(f.turns, f.now, f.aheadMs, f.aheadMs * behindX)) {
    const alpha = markerAlpha(m.x, behindX)
    if (alpha <= 0)
      continue
    const a = hitA + m.x * span
    if (m.turn.kind === 'bottom') {
      const r = markerRadius(m.turn.amp, maxR) * (m.x < 0 ? 1 + (m.x / behindX) * 0.5 : 1)
      g.globalAlpha = alpha
      g.fillStyle = heatColor(m.turn.speed, f.oklch)
      g.beginPath()
      g.arc(a, mid, Math.max(1, r), 0, Math.PI * 2)
      g.fill()
      g.globalAlpha = alpha * 0.5
      g.strokeStyle = 'rgba(0,0,0,0.6)'
      g.lineWidth = 1
      g.stroke()
    }
    else if (f.showTops) {
      const len = markerRadius(m.turn.amp, maxR) * 0.55
      g.globalAlpha = alpha * 0.5
      g.strokeStyle = p.text
      g.lineWidth = Math.max(1.5, 2 * f.scale)
      g.lineCap = 'round'
      g.beginPath()
      g.moveTo(a, mid - len)
      g.lineTo(a, mid + len)
      g.stroke()
    }
  }

  // The hit zone itself, on top.
  g.globalAlpha = 0.55 + 0.45 * pulse
  g.strokeStyle = pulse > 0.01 ? p.text : p.accent
  g.lineWidth = Math.max(1.5, 2 * f.scale)
  g.beginPath()
  g.arc(hitA, mid, maxR * (1.12 + 0.18 * pulse), 0, Math.PI * 2)
  g.stroke()
  g.restore()
  g.globalAlpha = 1
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
    g.globalAlpha = markerAlpha((ta - f.now) / f.aheadMs, 0) * 0.95
    g.strokeStyle = heatColor(speed, f.oklch)
    g.beginPath()
    g.moveTo(x(ta), y(pa))
    g.lineTo(x(tb), y(pb))
    g.stroke()
  }

  // Beats on the path: a dot at each bottom.
  for (const m of markersAt(f.turns, f.now, f.aheadMs)) {
    if (m.turn.kind !== 'bottom' && !f.showTops)
      continue
    const alpha = markerAlpha(m.x, 0)
    if (alpha <= 0)
      continue
    g.globalAlpha = alpha
    g.fillStyle = m.turn.kind === 'bottom' ? heatColor(m.turn.speed, f.oklch) : p.text
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
    g.shadowColor = heatColor(speedNow, f.oklch)
    g.shadowBlur = 14 * s * pulse
  }
  g.fillStyle = heatColor(speedNow, f.oklch)
  roundRect(g, gx - pw / 2, py - ph / 2, pw, ph, ph / 2)
  g.fill()
  g.shadowBlur = 0
  g.strokeStyle = p.text
  g.globalAlpha = 0.85
  g.lineWidth = 1.5
  g.stroke()
  g.globalAlpha = 1
}
