export type ProjectBackground = {
  id: string;
  label: string;
  src: string;
  credit: string;
};

export const projectBackgrounds: ProjectBackground[] = [
  { id: 'none', label: 'Plain midnight', src: '', credit: 'Built-in' },
  { id: 'mountain-night', label: 'Mountain night', src: '/assets/backgrounds/mountain-night.jpg', credit: 'Unsplash' },
  { id: 'forest-mist', label: 'Forest mist', src: '/assets/backgrounds/forest-mist.jpg', credit: 'Unsplash' },
  { id: 'studio-light', label: 'Studio light', src: '/assets/backgrounds/studio-light.jpg', credit: 'Unsplash' },
  { id: 'coastal-haze', label: 'Coastal haze', src: '/assets/backgrounds/coastal-haze.jpg', credit: 'Unsplash' }
];

export function projectBackground(id: string) {
  return projectBackgrounds.find((background) => background.id === id) ?? projectBackgrounds[0];
}
