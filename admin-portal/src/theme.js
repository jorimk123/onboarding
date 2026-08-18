// Applies an organization's accent color to the CSS custom properties that
// drive the purple accent throughout the UI. Falls back to the default
// design-system purple when no business/accent_color is set.
const DEFAULT = '#5b4fd6';

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function mix(hex, withHex, amount) {
  const a = hexToRgb(hex), b = hexToRgb(withHex);
  if (!a || !b) return hex;
  const r = Math.round(a.r + (b.r - a.r) * amount);
  const g = Math.round(a.g + (b.g - a.g) * amount);
  const bl = Math.round(a.b + (b.b - a.b) * amount);
  return `#${[r, g, bl].map(n => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')).join('')}`;
}

function rgba(hex, alpha) {
  const c = hexToRgb(hex);
  if (!c) return `rgba(91,79,214,${alpha})`;
  return `rgba(${c.r},${c.g},${c.b},${alpha})`;
}

export function applyAccentColor(accentColor) {
  const hex = /^#[0-9a-f]{6}$/i.test(accentColor || '') ? accentColor : DEFAULT;
  const root = document.documentElement.style;
  root.setProperty('--purple', hex);
  root.setProperty('--purple-mid', mix(hex, '#ffffff', 0.35));
  root.setProperty('--purple-pale', mix(hex, '#ffffff', 0.28));
  root.setProperty('--purple-text', mix(hex, '#000000', 0.15));
  root.setProperty('--purple-light', rgba(hex, 0.12));
}
