import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tattoo Creator — Estudio de Consulta con IA',
  description:
    'Consulta guiada de tatuajes con OpenAI GPT-6 Astra, stencils 1:1 y simulación en piel.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
