/**
 * The bar's box over the picture. Its size follows the size setting
 * (--phbb-scale); the canvas inside follows the box. Bottom sits above
 * playhound's controls, so the two don't cover each other.
 */
export const CSS = `
.phbb {
  position: absolute;
  pointer-events: none;
  opacity: var(--phbb-opacity, 0.85);
  transition: opacity 0.25s ease;
  --phbb-scale: 1;
}
.phbb.phbb-off { opacity: 0; }
.phbb canvas { display: block; width: 100%; height: 100%; }

.phbb[data-side="top"], .phbb[data-side="bottom"] {
  left: 50%;
  transform: translateX(-50%);
  width: min(78%, calc(620px * var(--phbb-scale)));
  height: calc(50px * var(--phbb-scale));
}
.phbb[data-side="top"] { top: 20px; }
.phbb[data-side="bottom"] { bottom: 80px; }

.phbb[data-side="left"], .phbb[data-side="right"] {
  top: 50%;
  transform: translateY(-50%);
  width: calc(50px * var(--phbb-scale));
  height: min(64%, calc(420px * var(--phbb-scale)));
}
.phbb[data-side="left"] { left: 20px; }
.phbb[data-side="right"] { right: 20px; }

.phbb[data-style="guide"][data-side="top"], .phbb[data-style="guide"][data-side="bottom"] {
  width: min(70%, calc(320px * var(--phbb-scale)));
  height: calc(110px * var(--phbb-scale));
}
.phbb[data-style="guide"][data-side="left"], .phbb[data-style="guide"][data-side="right"] {
  width: min(42%, calc(220px * var(--phbb-scale)));
  height: min(64%, calc(300px * var(--phbb-scale)));
}

@media (prefers-reduced-motion: reduce) {
  .phbb { transition: none; }
}
`
