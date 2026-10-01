/** Choices the guided studio offers as buttons (TASK-0065). Values are the contract's. */

export const SIDE_CHOICES = [
  { value: 'left', label: 'Izquierdo' },
  { value: 'right', label: 'Derecho' },
  { value: 'centre', label: 'Centrado' },
];

export const BODY_CHOICES = [
  { value: 'masculine', label: 'Hombre' },
  { value: 'feminine', label: 'Mujer' },
];

export const COLOUR_CHOICES = [
  { value: 'black_and_grey', label: 'Negro y gris', swatch: 'linear-gradient(135deg,#111,#888)' },
  {
    value: 'colour',
    label: 'Color',
    swatch: 'linear-gradient(135deg,#c0392b,#e1a33a,#2e86de)',
  },
  {
    value: 'black_and_grey_with_accent',
    label: 'Negro con acentos de color',
    swatch: 'linear-gradient(135deg,#111 60%,#c0392b)',
  },
];

export interface DetailValues {
  style: string;
  body: string;
  side: string;
  bodyType: string;
  color: string;
}
