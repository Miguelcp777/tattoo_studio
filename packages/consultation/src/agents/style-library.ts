/**
 * Style catalogue offers (TASK-0028, ADR-0012).
 *
 * When the client names a style, the agent shows what that style actually looks like instead of
 * asking them to imagine it. The variant they pick settles the style; it is not a reference
 * (TASK-0038).
 *
 * Pure: it reads the shared catalogue and returns offers. Nothing here fetches or generates.
 */

import { STYLE_CATALOGUE, type StyleCatalogueEntry, type StyleName } from '@tattoo/contracts';

import type { StylePick } from './types';

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
 * The chosen variant as a style decision (TASK-0038, ADR-0017).
 *
 * Deliberately not a reference image. The catalogue shows what a style looks like; sending its
 * picture to the generator would also send its subject and its body (a tiger on a forearm) and
 * hand the moderation gate a photograph of skin. The style name reaches the design; the picture
 * stays on the page.
 */
export function offerAsPick(offer: StyleVariantOffer): StylePick {
  return { id: offer.id, style: offer.style, label: `${offer.styleLabel} · ${offer.label}` };
}
