export type ProjectBackground = {
  id: string;
  label: string;
  src: string;
  /** A flat CSS gradient/color for a Trello-classic board background.
   * Mutually exclusive with `src` — a background has a photo or a color, not both. */
  color?: string;
  /** Groups the option in the settings picker. */
  kind: 'none' | 'color' | 'gradient' | 'pattern' | 'photo';
  credit: string;
};

export const projectBackgrounds: ProjectBackground[] = [
  { id: 'none', label: 'Plain midnight', src: '', kind: 'none', credit: 'Built-in' },

  // Trello's classic flat board colors.
  { id: 'trello-blue', label: 'Blue', src: '', color: '#0c66e4', kind: 'color', credit: 'Built-in' },
  { id: 'trello-orange', label: 'Orange', src: '', color: '#d9822b', kind: 'color', credit: 'Built-in' },
  { id: 'trello-green', label: 'Green', src: '', color: '#388e3c', kind: 'color', credit: 'Built-in' },
  { id: 'trello-red', label: 'Red', src: '', color: '#cf513f', kind: 'color', credit: 'Built-in' },
  { id: 'trello-purple', label: 'Purple', src: '', color: '#6e5dc6', kind: 'color', credit: 'Built-in' },
  { id: 'trello-pink', label: 'Pink', src: '', color: '#d84a91', kind: 'color', credit: 'Built-in' },
  { id: 'trello-lime', label: 'Lime', src: '', color: '#7bb61b', kind: 'color', credit: 'Built-in' },
  { id: 'trello-sky', label: 'Sky', src: '', color: '#29a3cc', kind: 'color', credit: 'Built-in' },
  { id: 'trello-grey', label: 'Grey', src: '', color: '#5e6c84', kind: 'color', credit: 'Built-in' },

  // Two-tone diagonal gradients — a step up from flat color, still self-contained CSS.
  { id: 'gradient-dusk', label: 'Dusk', src: '', color: 'linear-gradient(160deg, #6e5dc6, #cf513f 65%, #d9822b)', kind: 'gradient', credit: 'Built-in' },
  { id: 'gradient-ocean', label: 'Ocean', src: '', color: 'linear-gradient(160deg, #0c66e4, #29a3cc 60%, #1fb6a0)', kind: 'gradient', credit: 'Built-in' },
  { id: 'gradient-meadow', label: 'Meadow', src: '', color: 'linear-gradient(160deg, #7bb61b, #388e3c 60%, #1fb6a0)', kind: 'gradient', credit: 'Built-in' },
  { id: 'gradient-berry', label: 'Berry', src: '', color: 'linear-gradient(160deg, #d84a91, #6e5dc6 60%, #3d3597)', kind: 'gradient', credit: 'Built-in' },
  { id: 'gradient-ember', label: 'Ember', src: '', color: 'linear-gradient(160deg, #e8912d, #cf513f 55%, #a83f31)', kind: 'gradient', credit: 'Built-in' },
  { id: 'gradient-midnight', label: 'Midnight glow', src: '', color: 'linear-gradient(160deg, #29a3cc, #6e5dc6 55%, #0a4faf)', kind: 'gradient', credit: 'Built-in' },

  // Self-contained CSS textures — no image file, so these cost nothing to add
  // and nothing to keep, unlike the curated photos below.
  { id: 'pattern-grid', label: 'Grid', src: '', color: 'repeating-linear-gradient(0deg, rgb(255 255 255 / .07) 0 1px, transparent 1px 32px), repeating-linear-gradient(90deg, rgb(255 255 255 / .07) 0 1px, transparent 1px 32px) #26314a', kind: 'pattern', credit: 'Built-in' },
  { id: 'pattern-dots', label: 'Dots', src: '', color: 'radial-gradient(circle, rgb(255 255 255 / .16) 2px, transparent 2.6px) 0 0/22px 22px, #4a3b82', kind: 'pattern', credit: 'Built-in' },
  { id: 'pattern-weave', label: 'Weave', src: '', color: 'repeating-linear-gradient(45deg, rgb(255 255 255 / .06) 0 2px, transparent 2px 18px), repeating-linear-gradient(-45deg, rgb(255 255 255 / .06) 0 2px, transparent 2px 18px) #1f7a52', kind: 'pattern', credit: 'Built-in' },

  { id: 'mountain-night', label: 'Mountain night', src: '/assets/backgrounds/mountain-night.jpg', kind: 'photo', credit: 'Unsplash' },
  { id: 'forest-mist', label: 'Forest mist', src: '/assets/backgrounds/forest-mist.jpg', kind: 'photo', credit: 'Unsplash' },
  { id: 'studio-light', label: 'Studio light', src: '/assets/backgrounds/studio-light.jpg', kind: 'photo', credit: 'Unsplash' },
  { id: 'coastal-haze', label: 'Coastal haze', src: '/assets/backgrounds/coastal-haze.jpg', kind: 'photo', credit: 'Unsplash' }
];

export function projectBackground(id: string) {
  return projectBackgrounds.find((background) => background.id === id) ?? projectBackgrounds[0];
}
