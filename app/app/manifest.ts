import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'cadence',
    short_name: 'cadence',
    description: 'Séance du jour, récupération et saisie',
    start_url: '/',
    display: 'standalone',
    background_color: '#F3F2F2',
    theme_color: '#201E1D',
    icons: [
      { src: '/icone-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icone-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
