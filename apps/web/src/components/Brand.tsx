import type { ReactNode } from 'react';

/**
 * Inkcraft by Aurevanta Labs (TASK-0048).
 *
 * The Aurevanta symbol is recoloured in the rose gold of the background's veins rather than its
 * original neon gradient, so the maker's mark belongs to the studio instead of sitting on it.
 *
 * - `header`: the symbol as a hallmark beside the product name, for the studio's top bar.
 * - `card`: the product name, then the full Aurevanta Labs lockup as the signature, for the
 *   sign-in card where there is room for the wordmark to be read.
 */
export function Brand({ variant }: { variant: 'header' | 'card' }): ReactNode {
  if (variant === 'card')
    return (
      <div className="brand brand-card">
        <p className="brand-name">Inkcraft</p>
        <p className="brand-by">
          <span>by</span>
          <img src="/brand/aurevanta-labs.png" alt="Aurevanta Labs" width={180} height={38} />
        </p>
      </div>
    );

  return (
    <div className="brand brand-header">
      {/* Decorative: the text beside it already says whose mark it is. */}
      <img className="brand-mark" src="/brand/aurevanta-mark.png" alt="" width={34} height={32} />
      <div className="brand-text">
        <span className="brand-name">Inkcraft</span>
        <span className="brand-by">
          by <strong>Aurevanta Labs</strong>
        </span>
      </div>
    </div>
  );
}
