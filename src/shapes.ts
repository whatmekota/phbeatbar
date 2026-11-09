/**
 * Marker shapes as vector paths, one unit across from the centre (they fit
 * the square -1…1, y pointing down), so they stay crisp at any size: the
 * canvas scales the path, never a picture.
 */

export type Shape = 'circle' | 'heart' | 'star' | 'paw' | 'diamond'
export const SHAPES: readonly Shape[] = ['circle', 'heart', 'star', 'paw', 'diamond']

export type PathOp
  = | ['M', number, number]
    | ['L', number, number]
    | ['C', number, number, number, number, number, number]
    /** An ellipse of its own (a separate outline): centre and radii. */
    | ['E', number, number, number, number]
    | ['Z']

/** Points of a star: `n` tips at `outer`, the notches between at `inner`, the first tip straight up. */
function star(n: number, outer: number, inner: number): PathOp[] {
  const ops: PathOp[] = []
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? inner : outer
    const a = -Math.PI / 2 + (i * Math.PI) / n
    const x = +(Math.cos(a) * r).toFixed(4)
    const y = +(Math.sin(a) * r).toFixed(4)
    ops.push(i ? ['L', x, y] : ['M', x, y])
  }
  ops.push(['Z'])
  return ops
}

const PATHS: Record<Shape, PathOp[]> = {
  circle: [['E', 0, 0, 1, 1]],
  diamond: [['M', 0, -1], ['L', 0.78, 0], ['L', 0, 1], ['L', -0.78, 0], ['Z']],
  star: star(5, 1, 0.46),
  // Two lobes on top, the tip at the bottom.
  heart: [
    ['M', 0, 0.92],
    ['C', -0.18, 0.74, -1, 0.3, -1, -0.24],
    ['C', -1, -0.74, -0.38, -0.96, 0, -0.5],
    ['C', 0.38, -0.96, 1, -0.74, 1, -0.24],
    ['C', 1, 0.3, 0.18, 0.74, 0, 0.92],
    ['Z'],
  ],
  // A pad and four toes.
  paw: [
    ['E', 0, 0.36, 0.52, 0.42],
    ['E', -0.7, -0.18, 0.2, 0.25],
    ['E', -0.27, -0.62, 0.2, 0.25],
    ['E', 0.27, -0.62, 0.2, 0.25],
    ['E', 0.7, -0.18, 0.2, 0.25],
  ],
}

/**
 * How much bigger than a circle each shape is drawn to look the same size:
 * a star or a diamond covers less of its square than a circle does.
 */
export const SHAPE_SCALE: Record<Shape, number> = { circle: 1, heart: 1.12, star: 1.25, paw: 1.12, diamond: 1.12 }

export function shapeOps(shape: Shape): readonly PathOp[] {
  return PATHS[shape] ?? PATHS.circle
}

/** The box round a path's points (control points too, so it is never smaller than the shape). */
export function bounds(ops: readonly PathOp[]): { minX: number, minY: number, maxX: number, maxY: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const add = (x: number, y: number) => {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  for (const op of ops) {
    if (op[0] === 'E') {
      add(op[1] - op[3], op[2] - op[4])
      add(op[1] + op[3], op[2] + op[4])
    }
    else if (op[0] !== 'Z') {
      for (let i = 1; i < op.length; i += 2)
        add(op[i] as number, op[i + 1] as number)
    }
  }
  return { minX, minY, maxX, maxY }
}

/** The path, replayed onto a canvas path (Path2D or a context). */
export function tracePath(p: Path2D | CanvasRenderingContext2D, ops: readonly PathOp[]) {
  for (const op of ops) {
    switch (op[0]) {
      case 'M': p.moveTo(op[1], op[2])
        break
      case 'L': p.lineTo(op[1], op[2])
        break
      case 'C': p.bezierCurveTo(op[1], op[2], op[3], op[4], op[5], op[6])
        break
      case 'E':
        p.moveTo(op[1] + op[3], op[2])
        p.ellipse(op[1], op[2], op[3], op[4], 0, 0, Math.PI * 2)
        break
      case 'Z': p.closePath()
    }
  }
}

const cache = new Map<Shape, Path2D>()

/** The shape as a unit Path2D, made once. */
export function shapePath(shape: Shape): Path2D {
  let p = cache.get(shape)
  if (!p) {
    p = new Path2D()
    tracePath(p, shapeOps(shape))
    cache.set(shape, p)
  }
  return p
}

const extents = new Map<Shape, ReturnType<typeof bounds>>()

/** How far a shape reaches from its centre each way, at unit size (for placing things beside it). */
export function shapeExtent(shape: Shape): ReturnType<typeof bounds> {
  let b = extents.get(shape)
  if (!b) {
    b = bounds(shapeOps(shape))
    extents.set(shape, b)
  }
  return b
}

/**
 * How far the outline of a marker drawn `r` big reaches from its centre
 * downward, or leftward: where a pointer at it starts.
 */
export function outlineReach(shape: Shape, r: number, toward: 'below' | 'left'): number {
  const e = shapeExtent(shape)
  return r * SHAPE_SCALE[shape] * (toward === 'left' ? -e.minX : e.maxY)
}
