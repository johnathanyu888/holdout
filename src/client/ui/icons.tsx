// Small inline icons for UI controls (the game's own art is used for parts).

const S = { fill: 'none', stroke: 'currentColor', 'stroke-width': 2.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } as const;

export const IconSelect = () => (
  <svg viewBox="0 0 24 24" {...S}>
    <path d="M5 3 L19 12 L12.5 13.5 L9 20 Z" fill="currentColor" />
  </svg>
);
export const IconErase = () => (
  <svg viewBox="0 0 24 24" {...S}>
    <path d="M4 7 H20 M9 7 V4 H15 V7 M6.5 7 L7.5 20 H16.5 L17.5 7 M10.5 11 V16 M13.5 11 V16" />
  </svg>
);
export const IconUndo = () => (
  <svg viewBox="0 0 24 24" {...S}>
    <path d="M9 6 L4 11 L9 16 M4 11 H14 A6 6 0 0 1 14 23" transform="translate(0 -2)" />
  </svg>
);
export const IconRedo = () => (
  <svg viewBox="0 0 24 24" {...S}>
    <path d="M15 6 L20 11 L15 16 M20 11 H10 A6 6 0 0 0 10 23" transform="translate(0 -2)" />
  </svg>
);
export const IconPlus = () => (
  <svg viewBox="0 0 24 24" {...S}>
    <path d="M12 5 V19 M5 12 H19" />
  </svg>
);
export const IconMinus = () => (
  <svg viewBox="0 0 24 24" {...S}>
    <path d="M5 12 H19" />
  </svg>
);
export const IconFit = () => (
  <svg viewBox="0 0 24 24" {...S}>
    <path d="M4 9 V4 H9 M15 4 H20 V9 M20 15 V20 H15 M9 20 H4 V15" />
  </svg>
);
export const IconHand = () => (
  <svg viewBox="0 0 24 24" {...S}>
    <path d="M8 12 V5.5 a1.5 1.5 0 0 1 3 0 V11 M11 10 V4 a1.5 1.5 0 0 1 3 0 V11 M14 10 V5.5 a1.5 1.5 0 0 1 3 0 V13 c0 4 -2.5 7 -6 7 c-3 0 -4.5 -1.5 -6 -4.5 L3.5 12 a1.5 1.5 0 0 1 2.6 -1.5 L8 13" />
  </svg>
);
export const IconRotate = () => (
  <svg viewBox="0 0 24 24" {...S}>
    <path d="M20 12 A8 8 0 1 1 15.5 4.8 M15 2 L16 5.2 L12.8 6.2" />
  </svg>
);
export const IconPause = () => (
  <svg viewBox="0 0 24 24" {...S}>
    <path d="M8 5 V19 M16 5 V19" stroke-width="3.4" />
  </svg>
);
export const IconPlay = () => (
  <svg viewBox="0 0 24 24" {...S}>
    <path d="M7 4.5 L19 12 L7 19.5 Z" fill="currentColor" />
  </svg>
);

export const icon = (name: string) => `assets/icons/${name}.svg`;
