'use client';

/**
 * Style variant picker (TASK-0028, ADR-0012).
 *
 * Shows what a style actually looks like instead of asking the client to imagine it. The pick
 * travels as an identifier; the route resolves it against the catalogue, so nothing here can
 * introduce a reference of its own (WEB-INV-001).
 */

import type { StyleVariantOffer } from '@tattoo/consultation/style-library';

export interface StylePickerProps {
  offers: StyleVariantOffer[];
  /** Identifier of the current pick, if any. */
  selected?: string | undefined;
  disabled?: boolean;
  onSelect: (id: string) => void;
}

export function StylePicker({
  offers,
  selected,
  disabled,
  onSelect,
}: StylePickerProps): React.JSX.Element | null {
  if (!offers.length) return null;
  const styleLabel = offers[0]!.styleLabel;
  return (
    <section className="style-picker" aria-label={`Variantes de ${styleLabel}`}>
      <h3 id="step-estilo">¿Cuál de estos {styleLabel.toLowerCase()} se parece más a tu idea?</h3>
      <p className="small-note">
        Renders ilustrativos generados por el estudio, no fotografías de trabajos reales. El que
        elijas se usará como referencia junto a tus imágenes.
      </p>
      <ul className="style-options">
        {offers.map((offer) => {
          const isSelected = offer.id === selected;
          return (
            <li key={offer.id}>
              <button
                type="button"
                className={`style-option${isSelected ? ' is-selected' : ''}`}
                aria-pressed={isSelected}
                disabled={disabled}
                onClick={() => onSelect(offer.id)}
              >
                <img
                  src={offer.image}
                  alt={`${styleLabel}, variante ${offer.label}`}
                  loading="lazy"
                />
                <span className="style-option-label">{offer.label}</span>
                <span className="style-option-hint">{offer.characteristics}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
