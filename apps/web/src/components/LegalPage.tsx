import type { ReactNode } from 'react';

import { Brand } from './Brand';
import { LEGAL_DRAFT, type LegalSection } from '@/content/legal';

/** The full terms or privacy policy (TASK-0064), readable before signing in. */
export function LegalPage({
  title,
  version,
  sections,
}: {
  title: string;
  version: string;
  sections: LegalSection[];
}): ReactNode {
  return (
    <main className="legal-page">
      <Brand variant="card" />
      <h1>{title}</h1>
      <p className="small-note">Versión {version}</p>
      {LEGAL_DRAFT && (
        <p className="notice-banner" role="note">
          Borrador pendiente de revisión legal.
        </p>
      )}
      {sections.map((section) => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
      ))}
      <p>
        <a href="/">Volver al estudio</a>
      </p>
    </main>
  );
}
