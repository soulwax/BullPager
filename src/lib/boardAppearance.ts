/**
 * Board appearance model.
 *
 * The board used to decide "is this surface light or dark?" in two unrelated
 * places: one rule set the *background* (the photo-background glass override)
 * and a different, lower-specificity rule set the *text color* (the Trello
 * light-card pass). Whenever both applied, the winner for `background` and the
 * winner for `color` came from different design intents, which is how a board
 * on a photo background ended up rendering dark ink on a dark glass card.
 *
 * The fix is this module plus `styles/board-theme.css`: background and
 * foreground are never chosen separately again. A resolved appearance always
 * yields a *paired* token set — every surface token (`--card-bg`) has an ink
 * token (`--card-ink`) defined in the same block — so an unreadable
 * combination cannot be expressed.
 *
 * Everything here is pure and serializable so it can be unit-tested and shared
 * between the quick appearance panel, the project settings form, and the
 * server-side validation of both.
 */

/** Whether a surface is dark (wants light ink) or light (wants dark ink). */
export type SurfaceTone = 'dark' | 'light';

export type BoardThemeId =
  | 'midnight'
  | 'ocean'
  | 'slate'
  | 'forest'
  | 'nebula'
  | 'light'
  | 'paper'
  | 'contrast';

/**
 * How lists and cards are painted.
 *
 * `auto` deliberately *contrasts* with the canvas rather than matching it: a
 * dark board gets light cards and a light board gets dark cards, which is the
 * arrangement that keeps card text legible without depending on which
 * background image or color happens to be selected. The explicit values exist
 * because "dark canvas, dark cards" is a legitimate preference — it just has
 * to come with light ink, which it now always does.
 */
export type CardThemeId = 'auto' | 'light' | 'dark' | 'glass-light' | 'glass-dark';

export type DensityId = 'spacious' | 'comfortable' | 'compact' | 'dense';
export type RadiusId = 'sharp' | 'soft' | 'round';
export type LaneWidthId = 'narrow' | 'standard' | 'wide';
export type TextScaleId = 'small' | 'normal' | 'large';
export type ShadowId = 'flat' | 'soft' | 'lifted';

export type BoardAppearance = {
  theme: BoardThemeId;
  cardTheme: CardThemeId;
  density: DensityId;
  radius: RadiusId;
  laneWidth: LaneWidthId;
  textScale: TextScaleId;
  shadow: ShadowId;
  /** 0–100. Only meaningful for the two glass card themes. */
  glassIntensity: number;
  /** `#rrggbb`. Board-level accent, falls back to the workspace accent. */
  accent: string;
  /** Boost separators and muted text for low-light or projector use. */
  highContrast: boolean;
};

export type BoardThemeOption = {
  id: BoardThemeId;
  label: string;
  /** The tone of this theme's own canvas, used when no background is chosen. */
  tone: SurfaceTone;
  /** Preview swatch for the picker; matches the canvas the theme paints. */
  swatch: string;
  hint: string;
};

export const boardThemes: BoardThemeOption[] = [
  { id: 'midnight', label: 'Midnight', tone: 'dark', swatch: 'linear-gradient(150deg, #0c50bb, #11b4d1)', hint: 'Default deep blue' },
  { id: 'ocean', label: 'Ocean', tone: 'dark', swatch: 'linear-gradient(150deg, #06283d, #1b7ea3)', hint: 'Cool and quiet' },
  { id: 'slate', label: 'Slate', tone: 'dark', swatch: 'linear-gradient(150deg, #1b1f26, #414a57)', hint: 'Neutral grey' },
  { id: 'forest', label: 'Forest', tone: 'dark', swatch: 'linear-gradient(150deg, #0d2a1e, #2f7d5b)', hint: 'Low-glare green' },
  { id: 'nebula', label: 'Nebula', tone: 'dark', swatch: 'linear-gradient(150deg, #241543, #7a4bd0)', hint: 'Warm violet' },
  { id: 'light', label: 'Daylight', tone: 'light', swatch: 'linear-gradient(150deg, #e6edf5, #ffffff)', hint: 'Bright neutral' },
  { id: 'paper', label: 'Paper', tone: 'light', swatch: 'linear-gradient(150deg, #efe8dc, #fdfaf4)', hint: 'Warm off-white' },
  { id: 'contrast', label: 'High contrast', tone: 'dark', swatch: 'linear-gradient(150deg, #000000, #2b2b2b)', hint: 'Maximum legibility' }
];

export const cardThemes: { id: CardThemeId; label: string; hint: string }[] = [
  { id: 'auto', label: 'Auto', hint: 'Light cards on a dark board, dark cards on a light board' },
  { id: 'light', label: 'Light', hint: 'White cards with dark text' },
  { id: 'dark', label: 'Dark', hint: 'Dark cards with light text' },
  { id: 'glass-light', label: 'Light glass', hint: 'Frosted pale cards over the background' },
  { id: 'glass-dark', label: 'Dark glass', hint: 'Frosted dark cards over the background' }
];

export const densities: { id: DensityId; label: string }[] = [
  { id: 'spacious', label: 'Spacious' },
  { id: 'comfortable', label: 'Comfortable' },
  { id: 'compact', label: 'Compact' },
  { id: 'dense', label: 'Dense' }
];

export const radii: { id: RadiusId; label: string }[] = [
  { id: 'sharp', label: 'Sharp' },
  { id: 'soft', label: 'Soft' },
  { id: 'round', label: 'Round' }
];

export const laneWidths: { id: LaneWidthId; label: string }[] = [
  { id: 'narrow', label: 'Narrow' },
  { id: 'standard', label: 'Standard' },
  { id: 'wide', label: 'Wide' }
];

export const textScales: { id: TextScaleId; label: string }[] = [
  { id: 'small', label: 'Small' },
  { id: 'normal', label: 'Normal' },
  { id: 'large', label: 'Large' }
];

export const shadows: { id: ShadowId; label: string }[] = [
  { id: 'flat', label: 'Flat' },
  { id: 'soft', label: 'Soft' },
  { id: 'lifted', label: 'Lifted' }
];

export const defaultAppearance: BoardAppearance = {
  theme: 'midnight',
  cardTheme: 'auto',
  density: 'comfortable',
  radius: 'soft',
  laneWidth: 'standard',
  textScale: 'normal',
  shadow: 'soft',
  glassIntensity: 38,
  accent: '#73b6ff',
  highContrast: false
};

const themeIds = new Set<string>(boardThemes.map((theme) => theme.id));
const cardThemeIds = new Set<string>(cardThemes.map((theme) => theme.id));
const densityIds = new Set<string>(densities.map((density) => density.id));
const radiusIds = new Set<string>(radii.map((radius) => radius.id));
const laneWidthIds = new Set<string>(laneWidths.map((width) => width.id));
const textScaleIds = new Set<string>(textScales.map((scale) => scale.id));
const shadowIds = new Set<string>(shadows.map((shadow) => shadow.id));

const pick = <T extends string>(allowed: Set<string>, value: unknown, fallback: T): T =>
  typeof value === 'string' && allowed.has(value) ? (value as T) : fallback;

/**
 * Legacy density values. The board shipped a two-step comfortable/compact
 * control before this four-step scale, and those two names survive unchanged
 * so existing saved boards keep the spacing their owners chose.
 */
export function normalizeAppearance(raw: Partial<Record<keyof BoardAppearance, unknown>>): BoardAppearance {
  const glass = Number(raw.glassIntensity);
  const accent = typeof raw.accent === 'string' && /^#[0-9a-f]{6}$/i.test(raw.accent) ? raw.accent : defaultAppearance.accent;
  return {
    theme: pick(themeIds, raw.theme, defaultAppearance.theme),
    cardTheme: pick(cardThemeIds, raw.cardTheme, defaultAppearance.cardTheme),
    density: pick(densityIds, raw.density, defaultAppearance.density),
    radius: pick(radiusIds, raw.radius, defaultAppearance.radius),
    laneWidth: pick(laneWidthIds, raw.laneWidth, defaultAppearance.laneWidth),
    textScale: pick(textScaleIds, raw.textScale, defaultAppearance.textScale),
    shadow: pick(shadowIds, raw.shadow, defaultAppearance.shadow),
    glassIntensity: Number.isFinite(glass) ? Math.max(0, Math.min(100, Math.round(glass))) : defaultAppearance.glassIntensity,
    accent,
    highContrast: raw.highContrast === true || raw.highContrast === 'true'
  };
}

/** Reads an appearance out of the flat `project_<slug>_*` board settings map. */
export function appearanceFromSettings(settings: Record<string, string>, prefix: string): BoardAppearance {
  const value = (name: string) => settings[`${prefix}${name}`];
  return normalizeAppearance({
    theme: value('theme'),
    cardTheme: value('card_theme'),
    density: value('density'),
    radius: value('radius'),
    laneWidth: value('lane_width'),
    textScale: value('text_scale'),
    shadow: value('shadow'),
    glassIntensity: value('glass_intensity'),
    accent: value('accent'),
    highContrast: value('high_contrast')
  });
}

/** Writes an appearance back into flat board settings keys. */
export function appearanceToSettings(appearance: BoardAppearance, prefix: string): Record<string, string> {
  return {
    [`${prefix}theme`]: appearance.theme,
    [`${prefix}card_theme`]: appearance.cardTheme,
    [`${prefix}density`]: appearance.density,
    [`${prefix}radius`]: appearance.radius,
    [`${prefix}lane_width`]: appearance.laneWidth,
    [`${prefix}text_scale`]: appearance.textScale,
    [`${prefix}shadow`]: appearance.shadow,
    [`${prefix}glass_intensity`]: String(appearance.glassIntensity),
    [`${prefix}accent`]: appearance.accent,
    [`${prefix}high_contrast`]: String(appearance.highContrast)
  };
}

/** WCAG relative luminance, used to judge an arbitrary uploaded/board color. */
export function relativeLuminance(hex: string): number {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return 0;
  const int = Number.parseInt(match[1], 16);
  const channels = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map((raw) => {
    const channel = raw / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** A color is "light" once it is bright enough that white text would fail. */
export function toneForColor(color: string): SurfaceTone {
  const solid = /#[0-9a-f]{6}/i.exec(color);
  // Gradients and patterns list several stops; the first one is the dominant
  // top-left color the lists actually sit on, so it decides the tone.
  return solid && relativeLuminance(solid[0]) > 0.45 ? 'light' : 'dark';
}

export type BoardCanvas = {
  /** A photo background, if any. Photos always carry a dark scrim. */
  src?: string;
  /** A flat color, gradient, or CSS pattern, if any. */
  color?: string;
};

/** The tone of whatever the lists are actually sitting on. */
export function canvasTone(appearance: BoardAppearance, canvas: BoardCanvas): SurfaceTone {
  if (canvas.src) return 'dark';
  if (canvas.color) return toneForColor(canvas.color);
  return boardThemes.find((theme) => theme.id === appearance.theme)?.tone ?? 'dark';
}

/** The concrete card style after `auto` has been resolved against the canvas. */
export function resolveCardTheme(appearance: BoardAppearance, canvas: BoardCanvas): Exclude<CardThemeId, 'auto'> {
  if (appearance.cardTheme !== 'auto') return appearance.cardTheme;
  // Contrast with the canvas. This is the rule that makes a photo or deep-blue
  // board readable by default without anyone having to touch a setting.
  return canvasTone(appearance, canvas) === 'dark' ? 'light' : 'dark';
}

/** The tone of the cards themselves, i.e. which ink they need. */
export function cardTone(appearance: BoardAppearance, canvas: BoardCanvas): SurfaceTone {
  return resolveCardTheme(appearance, canvas).endsWith('dark') ? 'dark' : 'light';
}

/**
 * The inline custom properties the board root carries.
 *
 * Only values that cannot be expressed as a static rule live here (the accent
 * and the glass strength); every discrete choice becomes a `data-*` attribute
 * so the stylesheet owns the actual colors.
 */
export function appearanceStyle(appearance: BoardAppearance, canvas: BoardCanvas): string {
  const declarations = [`--accent: ${appearance.accent}`];
  const image = canvas.color || (canvas.src ? `url("${canvas.src}")` : '');
  if (image) declarations.push(`--project-bg-image: ${image}`);
  const resolved = resolveCardTheme(appearance, canvas);
  if (resolved.startsWith('glass')) {
    // A higher setting means *more* frosting: more blur, less opacity.
    declarations.push(`--glass-opacity: ${(0.92 - appearance.glassIntensity * 0.0042).toFixed(3)}`);
    declarations.push(`--glass-blur: ${Math.round(2 + appearance.glassIntensity * 0.16)}px`);
  }
  return `${declarations.join('; ')};`;
}

/** The `data-*` attributes the stylesheet selects on. */
export function appearanceAttributes(appearance: BoardAppearance, canvas: BoardCanvas) {
  return {
    'data-board-theme': appearance.theme,
    'data-card-theme': resolveCardTheme(appearance, canvas),
    'data-canvas-tone': canvasTone(appearance, canvas),
    'data-density': appearance.density,
    'data-radius': appearance.radius,
    'data-lane-width': appearance.laneWidth,
    'data-text-scale': appearance.textScale,
    'data-shadow': appearance.shadow,
    'data-contrast': appearance.highContrast ? 'high' : 'normal'
  } satisfies Record<string, string>;
}

/* ============================================================================
   Person color.


   A member's avatar color is deterministic from their name — the same person
   is always the same hue, everywhere on the board, with no color picker and
   nothing to store. It uses the same contrast math as the card/canvas pairing
   above (`relativeLuminance`) rather than a fixed ink, because a hash can land
   on any hue at any lightness — including ones white text fails against — and
   the whole point of computing a color instead of assigning one from a fixed
   palette is that it still has to promise a readable pair.
   ========================================================================= */

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (value: number) => Math.round(value * 255).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

/** A stable 0–359 hue for a name, so the same person always lands on the same
 * color without anyone choosing or storing one. */
export function personHue(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  return hash % 360;
}

export type PersonColor = { background: string; ink: SurfaceTone; initials: string };

/** One or two initials from a name or username — the first and last "word"
 * (splitting on space, dot, underscore, or hyphen so `jane.doe` reads as two
 * initials too), or the first two characters of a single word. */
export function initialsFor(name: string): string {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** A name's full avatar treatment: a hash-derived background at a fixed
 * saturation/lightness, and the ink that background actually needs — computed,
 * not assumed, so a hash landing on a pale yellow still gets dark text. */
export function personColor(name: string): PersonColor {
  const seed = name.trim() || '?';
  const background = hslToHex(personHue(seed), 62, 46);
  return { background, ink: relativeLuminance(background) > 0.45 ? 'dark' : 'light', initials: initialsFor(seed) };
}
