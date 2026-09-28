import type { MetadataRoute } from 'next';

/**
 * The installable app (TASK-0042, ADR-0019). Installing matters because the try-on wants the
 * camera on a phone, and an installed page gets a full-screen surface and a permission grant that
 * survives navigation.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Tattoo Creator — Estudio de tatuaje',
    short_name: 'Tattoo Creator',
    description:
      'Diseña tu tatuaje, pruébalo con la cámara en tu propio móvil y llévate la plantilla a tamaño real.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#14110f',
    theme_color: '#14110f',
    lang: 'es',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
