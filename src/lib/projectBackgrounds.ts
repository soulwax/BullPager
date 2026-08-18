export type ProjectBackground = {
  id: string;
  label: string;
  src: string;
  /** A flat CSS gradient/color for a Trello-classic solid board background.
   * Mutually exclusive with `src` — a background has a photo or a color, not both. */
  color?: string;
  credit: string;
};

export const projectBackgrounds: ProjectBackground[] = [
  { id: 'none', label: 'Plain midnight', src: '', credit: 'Built-in' },
  { id: 'trello-blue', label: 'Classic blue', src: '', color: 'linear-gradient(160deg, #1976d2, #0c66e4 55%, #0a4faf)', credit: 'Built-in' },
  { id: 'trello-green', label: 'Classic green', src: '', color: 'linear-gradient(160deg, #4f9e5b, #388e3c 55%, #2c6e30)', credit: 'Built-in' },
  { id: 'trello-orange', label: 'Classic orange', src: '', color: 'linear-gradient(160deg, #e8912d, #d9822b 55%, #b3661d)', credit: 'Built-in' },
  { id: 'trello-purple', label: 'Classic purple', src: '', color: 'linear-gradient(160deg, #8b6fd6, #6e5dc6 55%, #55469e)', credit: 'Built-in' },
  { id: 'trello-red', label: 'Classic red', src: '', color: 'linear-gradient(160deg, #e0594f, #cf513f 55%, #a83f31)', credit: 'Built-in' },
  { id: 'mountain-night', label: 'Mountain night', src: '/assets/backgrounds/mountain-night.jpg', credit: 'Unsplash' },
  { id: 'forest-mist', label: 'Forest mist', src: '/assets/backgrounds/forest-mist.jpg', credit: 'Unsplash' },
  { id: 'studio-light', label: 'Studio light', src: '/assets/backgrounds/studio-light.jpg', credit: 'Unsplash' },
  { id: 'coastal-haze', label: 'Coastal haze', src: '/assets/backgrounds/coastal-haze.jpg', credit: 'Unsplash' }
];

export function projectBackground(id: string) {
  return projectBackgrounds.find((background) => background.id === id) ?? projectBackgrounds[0];
}
