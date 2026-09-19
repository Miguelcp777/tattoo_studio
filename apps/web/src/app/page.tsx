import type { ReactNode } from 'react';

import { VISUALIZATION_DISCLAIMER } from '@/content/disclaimers';

export default function HomePage(): ReactNode {
  return (
    <main>
      <h1>Tattoo Creator</h1>
      <p>Specification phase. The consultation, stencil and mockup surfaces are not built yet.</p>
      <p>
        <small>{VISUALIZATION_DISCLAIMER}</small>
      </p>
    </main>
  );
}
