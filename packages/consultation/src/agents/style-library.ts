/**
 * Style catalogue offers (TASK-0028, ADR-0012).
 *
 * When the client names a style, the agent shows what that style actually looks like instead of
 * asking them to imagine it. The variant they pick becomes one more reference alongside anything
 * they uploaded and anything the scout found.
 *
 * Pure: it reads the shared catalogue and returns offers. Nothing here fetches or generates.
 */

import { STYLE_CATALOGUE, type StyleCatalogueEntry, type StyleName } from '@tattoo/contracts';

import type { ReferenceImage } from '../types';

export interface StyleVariantOffer {
  /** Stable identity of the pick, unique across styles. */
  id: string;
  style: StyleName;
  variant: string;
  /** Spanish label for the variant, e.g. "Maorí". */
  label: string;
  /** Spanish label for the parent style, e.g. "Tribal". */
  styleLabel: string;
  /** What the variant looks like. The same string the image was generated from. */
  characteristics: string;
  /** Path under the web app's public assets. */
  image: string;
}

const STYLES: Readonly<Record<string, StyleCatalogueEntry>> = STYLE_CATALOGUE;

/** Base path the web app serves the catalogue from. */
export const STYLE_LIBRARY_BASE = '/style-library';

export function styleLabel(style: string): string | undefined {
  return STYLES[style]?.label;
}

/** The three variants to show for a style, or nothing when the style is unknown. */
export function styleOffers(style: string | undefined): StyleVariantOffer[] {
  if (!style) return [];
  const entry = STYLES[style];
  if (!entry) return [];
  const name = style as StyleName;
  return entry.variants.map((variant) => ({
    id: `${name}:${variant.id}`,
    style: name,
    variant: variant.id,
    label: variant.label,
    styleLabel: entry.label,
    characteristics: variant.characteristics,
    image: `${STYLE_LIBRARY_BASE}/${style}/${variant.id}.webp`,
  }));
}

export function findOffer(id: string): StyleVariantOffer | undefined {
  const [style] = id.split(':');
  return styleOffers(style).find((offer) => offer.id === id);
}

/**
 * The chosen variant as a reference image.
 *
 * Marked `style_library` rather than `user_supplied`: it is an illustrative render the studio
 * generated, not a photograph of real work and not something the client brought. Anything shown
 * to the client must be able to say which of the three it is.
 */
export function offerAsReference(offer: StyleVariantOffer): ReferenceImage {
  return {
    source: offer.image,
    mimeType: 'image/webp',
    verification: 'style_library',
    referenceQuery: `${offer.styleLabel} · ${offer.label}`,
    // Shown on the reference card, so it is the Spanish name, not the English prompt text.
    label: `${offer.styleLabel} · ${offer.label}`,
    license: 'Render ilustrativo generado por el estudio',
  };
}
