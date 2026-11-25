// No page zoom. The game has its own pinch and wheel zoom on the canvas (the
// input router handles those and calls preventDefault); everywhere else a pinch,
// a trackpad pinch (Ctrl + wheel), Ctrl +/- or a double tap would zoom the whole
// page and break the layout, so they're stopped here. The viewport meta asks for
// the same, but iOS Safari ignores it, hence the gesture handlers.

export function blockPageZoom(): void {
  const opts = { passive: false } as const;
  // Trackpad pinch and Ctrl + mouse wheel arrive as wheel events with ctrlKey.
  window.addEventListener('wheel', (e) => e.ctrlKey && e.preventDefault(), opts);
  // Two-finger pinch on touch screens.
  document.addEventListener('touchmove', (e) => e.touches.length > 1 && e.preventDefault(), opts);
  // iOS Safari's own pinch gestures.
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(t, (e) => e.preventDefault(), opts);
  // Ctrl/Cmd with + - = 0: browser zoom keys.
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0', '_'].includes(e.key)) e.preventDefault();
  });
  // Double-tap to zoom.
  let last = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      const now = performance.now();
      if (now - last < 300 && e.touches.length === 0 && (e.target as HTMLElement | null)?.tagName !== 'BUTTON') e.preventDefault();
      last = now;
    },
    opts,
  );
}
