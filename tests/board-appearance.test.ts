import { describe, expect, it } from 'vitest';
import {
  appearanceAttributes,
  appearanceFromSettings,
  appearanceStyle,
  appearanceToSettings,
  canvasTone,
  cardTone,
  defaultAppearance,
  normalizeAppearance,
  relativeLuminance,
  resolveCardTheme,
  toneForColor,
  type BoardAppearance
} from '../src/lib/boardAppearance';

const withCardTheme = (cardTheme: BoardAppearance['cardTheme'], overrides: Partial<BoardAppearance> = {}): BoardAppearance => ({
  ...defaultAppearance,
  cardTheme,
  ...overrides
});

describe('normalizeAppearance', () => {
  it('falls back per field instead of rejecting a whole payload', () => {
    const appearance = normalizeAppearance({ theme: 'forest', cardTheme: 'not-a-theme', density: 'dense' });
    expect(appearance.theme).toBe('forest');
    expect(appearance.cardTheme).toBe(defaultAppearance.cardTheme);
    expect(appearance.density).toBe('dense');
  });

  it('clamps glass intensity into 0-100 and rejects a malformed accent', () => {
    expect(normalizeAppearance({ glassIntensity: 480 }).glassIntensity).toBe(100);
    expect(normalizeAppearance({ glassIntensity: -12 }).glassIntensity).toBe(0);
    expect(normalizeAppearance({ glassIntensity: 'nonsense' }).glassIntensity).toBe(defaultAppearance.glassIntensity);
    expect(normalizeAppearance({ accent: 'red' }).accent).toBe(defaultAppearance.accent);
    expect(normalizeAppearance({ accent: '#0C66E4' }).accent).toBe('#0C66E4');
  });

  it('accepts the string form booleans arrive in from a form post', () => {
    expect(normalizeAppearance({ highContrast: 'true' }).highContrast).toBe(true);
    expect(normalizeAppearance({ highContrast: 'false' }).highContrast).toBe(false);
    expect(normalizeAppearance({ highContrast: 'on' }).highContrast).toBe(false);
  });
});

describe('settings round trip', () => {
  it('survives a write/read cycle through the flat board settings map', () => {
    const appearance: BoardAppearance = {
      theme: 'nebula',
      cardTheme: 'glass-dark',
      density: 'compact',
      radius: 'round',
      laneWidth: 'wide',
      textScale: 'large',
      shadow: 'lifted',
      glassIntensity: 71,
      accent: '#1fb6a0',
      highContrast: true
    };
    const stored = appearanceToSettings(appearance, 'project_demo_');
    expect(stored['project_demo_card_theme']).toBe('glass-dark');
    expect(appearanceFromSettings(stored, 'project_demo_')).toEqual(appearance);
  });

  it('reads a board saved before this model as the documented defaults', () => {
    // Only `theme`, `density` and `glass_intensity` existed then.
    const legacy = { project_demo_theme: 'ocean', project_demo_density: 'compact', project_demo_glass_intensity: '38' };
    const appearance = appearanceFromSettings(legacy, 'project_demo_');
    expect(appearance.theme).toBe('ocean');
    expect(appearance.density).toBe('compact');
    expect(appearance.cardTheme).toBe('auto');
    expect(appearance.radius).toBe(defaultAppearance.radius);
  });
});

describe('tone detection', () => {
  it('ranks white above black by relative luminance', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(relativeLuminance('not a color')).toBe(0);
  });

  it('calls every shipped Trello board color dark enough for white chrome', () => {
    for (const color of ['#0c66e4', '#d9822b', '#388e3c', '#cf513f', '#6e5dc6', '#d84a91', '#7bb61b', '#29a3cc', '#5e6c84']) {
      expect(toneForColor(color)).toBe('dark');
    }
  });

  it('reads a gradient from its first stop', () => {
    expect(toneForColor('linear-gradient(160deg, #6e5dc6, #cf513f 65%, #d9822b)')).toBe('dark');
    expect(toneForColor('linear-gradient(160deg, #f6f0e6, #111111)')).toBe('light');
  });
});

describe('canvas and card tone', () => {
  it('treats a photo board as dark regardless of the theme behind it', () => {
    expect(canvasTone(withCardTheme('auto', { theme: 'light' }), { src: '/assets/backgrounds/studio-light.jpg' })).toBe('dark');
  });

  it('falls back to the theme when no background is chosen', () => {
    expect(canvasTone(withCardTheme('auto', { theme: 'midnight' }), {})).toBe('dark');
    expect(canvasTone(withCardTheme('auto', { theme: 'paper' }), {})).toBe('light');
  });
});

describe('resolveCardTheme', () => {
  it('contrasts with the canvas when set to auto', () => {
    // The regression this whole model exists for: a photo board must not end
    // up with dark ink on a dark surface.
    expect(resolveCardTheme(withCardTheme('auto'), { src: '/assets/backgrounds/mountain-night.jpg' })).toBe('light');
    expect(resolveCardTheme(withCardTheme('auto', { theme: 'light' }), {})).toBe('dark');
    expect(resolveCardTheme(withCardTheme('auto'), { color: '#0c66e4' })).toBe('light');
  });

  it('honours an explicit choice over the canvas', () => {
    expect(resolveCardTheme(withCardTheme('dark'), { src: '/photo.jpg' })).toBe('dark');
    expect(resolveCardTheme(withCardTheme('glass-light'), { color: '#0c66e4' })).toBe('glass-light');
  });

  it('pairs every resolved card style with the ink tone it needs', () => {
    expect(cardTone(withCardTheme('dark'), {})).toBe('dark');
    expect(cardTone(withCardTheme('glass-dark'), {})).toBe('dark');
    expect(cardTone(withCardTheme('light'), {})).toBe('light');
    expect(cardTone(withCardTheme('glass-light'), {})).toBe('light');
  });
});

describe('rendered output', () => {
  it('emits glass custom properties only for the glass styles', () => {
    expect(appearanceStyle(withCardTheme('light'), {})).not.toContain('--glass-opacity');
    const glass = appearanceStyle(withCardTheme('glass-dark', { glassIntensity: 100 }), { src: '/photo.jpg' });
    expect(glass).toContain('--glass-opacity');
    expect(glass).toContain('--glass-blur');
    expect(glass).toContain('url("/photo.jpg")');
  });

  it('keeps a frosted surface opaque enough to read at full intensity', () => {
    const style = appearanceStyle(withCardTheme('glass-light', { glassIntensity: 100 }), { src: '/photo.jpg' });
    const opacity = Number(/--glass-opacity: ([\d.]+)/.exec(style)?.[1]);
    expect(opacity).toBeGreaterThan(0.45);
    expect(opacity).toBeLessThanOrEqual(0.92);
  });

  it('publishes the resolved card theme, not the literal auto setting', () => {
    const attributes = appearanceAttributes(withCardTheme('auto'), { src: '/photo.jpg' });
    expect(attributes['data-card-theme']).toBe('light');
    expect(attributes['data-canvas-tone']).toBe('dark');
    expect(attributes['data-density']).toBe('comfortable');
    expect(attributes['data-contrast']).toBe('normal');
  });
});
