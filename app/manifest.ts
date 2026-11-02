import type { MetadataRoute } from 'next';

// Installable web app ("Add to home screen"): name, warm colours, basket icon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Smart Grocery IL',
    short_name: 'Smart Grocery',
    description: 'הקניות של הבית, במקום אחד — רשימה משותפת, תכנון ארוחות ומתכונים.',
    start_url: '/',
    display: 'standalone',
    background_color: '#FBF7F1',
    theme_color: '#FBF7F1',
    lang: 'he',
    dir: 'rtl',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
