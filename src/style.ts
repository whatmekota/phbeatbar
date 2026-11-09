/**
 * The bar's box over the picture. Its place and size are worked out in
 * script (see barRect) and set as left/top/width/height; it glides when the
 * player's own bars come and go.
 */
export const CSS = `
.phbb {
  position: absolute;
  pointer-events: none;
  opacity: var(--phbb-opacity, 0.85);
  transition: opacity 0.25s ease, top 0.2s ease, left 0.2s ease;
}
.phbb.phbb-off { opacity: 0; }
.phbb canvas { display: block; width: 100%; height: 100%; }

@media (prefers-reduced-motion: reduce) {
  .phbb { transition: none; }
}
`
