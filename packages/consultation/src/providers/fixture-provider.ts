import type { ConsultationTurn } from '../types';
import type { ConsultationProvider, ProviderExtractionOutput } from './types';

/**
 * Deterministic fixture provider for offline tests and CI execution.
 * Simulates intelligent responses and structured slot extraction based on turn inputs.
 */
export class FixtureConsultationProvider implements ConsultationProvider {
  async processTurn(turns: ConsultationTurn[]): Promise<ProviderExtractionOutput> {
    const allText = turns
      .map((t) => t.content)
      .join(' ')
      .toLowerCase();
    const lastTurn = turns[turns.length - 1];
    const hasImages = turns.some((t) => (t.referenceImages ?? []).length > 0);

    const hasSpanishHints =
      /[áéíóúñ¿¡]|\b(tatuaje|estilo|quiero|hola|brazo|pecho|espalda|gemelo|realis|hiper|senyera|valencia|color|negro|gris|por favor)\b/i.test(
        allText,
      );
    const hasEnglishHints =
      /\b(can you|in the style of|portrait|timber wolf|client|howling)\b/i.test(allText);
    const isSpanish = hasSpanishHints || !hasEnglishHints;

    // Check living artist mimicry (PROD-INV-004)
    if (
      allText.includes('nikko hurtado') ||
      allText.includes('dr woo') ||
      allText.includes('inal bersekov')
    ) {
      return {
        extractedSlots: {
          style: {
            primary: 'black_and_grey_realism',
            notes: isSpanish
              ? 'Cliente inspirado en retrato realista.'
              : 'Client inspired by realistic portraiture.',
          },
        },
        assistantReply: isSpanish
          ? 'Respeto mucho la trayectoria de ese artista, pero por ética profesional del tatuaje no imitamos ni copiamos el estilo de artistas vivos reconocidos. En su lugar, podemos diseñar una pieza original en estilo de realismo en negro y gris (black_and_grey_realism). ¿En qué parte del cuerpo te gustaría llevarlo y qué tamaño aproximado imaginas?'
          : 'I respect that artist greatly, but out of professional ethics and respect for their work, I do not copy or imitate the style of living artists. Instead, we can craft an original piece in black_and_grey_realism. Where on your body are you thinking of placing it, and how large?',
        mimicryDetected: {
          artistName: 'Nikko Hurtado',
          suggestedStyle: 'black_and_grey_realism',
          explanation: isSpanish
            ? 'La ética del tatuaje profesional prohíbe la copia directa de artistas vivos. Se reconduce a realismo en negro y gris.'
            : 'Professional tattoo ethics prohibit direct mimicry of living artists. Steered to black_and_grey_realism.',
        },
      };
    }

    // Check multimodal image reference turn or dragon/irezumi
    if (
      hasImages ||
      allText.includes('dragon') ||
      allText.includes('dragón') ||
      allText.includes('irezumi')
    ) {
      const refLabel =
        turns.find((t) => (t.referenceImages ?? []).length > 0)?.referenceImages?.[0]?.label ??
        (isSpanish ? 'Motivo japonés' : 'Japanese motif');
      return {
        extractedSlots: {
          subject: {
            description: isSpanish
              ? `Un dragón japonés ascendente dinámico envuelto entre flores de loto y barras de viento, basado en ${refLabel}`
              : `A dynamic Japanese ascending dragon coiled around lotus blossoms, referencing ${refLabel}`,
            elements: ['dragon', 'lotus', 'smoke_wind_bars'],
          },
          style: {
            primary: 'irezumi',
            notes: isSpanish
              ? 'Flujo tradicional wabori con barras de viento en el fondo.'
              : 'Traditional wabori flow with bold background wind bars.',
          },
          linework: {
            weight: 'bold',
            notes: isSpanish ? 'Contorno grueso clásico japonés' : 'Classic heavy Japanese outline',
          },
          shading: { technique: 'smooth_blend', intensity: 'heavy' },
          colour: { mode: 'black_and_grey' },
          placement: { bodyPart: 'outer_forearm', orientation: 'vertical', side: 'right' },
          size: { widthMm: 120, heightMm: 250 },
        },
        assistantReply: isSpanish
          ? 'Revisando las referencias, este concepto encaja con el estilo Irezumi: contorno definido y barras de viento. Para asegurar que envejezca impecable, ¿te gustaría realizarlo en degradados negros y grises con alto contraste?'
          : 'Looking at your reference, this fits the Irezumi style with strong contrast. What do you think of black and grey shading with heavy contrast?',
      };
    }

    // Wolf / American Traditional
    if (
      allText.includes('wolf') ||
      allText.includes('lobo') ||
      allText.includes('traditional') ||
      allText.includes('tradicional')
    ) {
      return {
        extractedSlots: {
          subject: {
            description: isSpanish
              ? 'Una cabeza de lobo aullando flanqueada por ramas de pino y una daga clásica'
              : 'A howling timber wolf head flanked by pine trees and dagger',
            elements: ['wolf head', 'dagger', 'pine branches'],
          },
          style: {
            primary: 'american_traditional',
            notes: isSpanish
              ? 'Líneas sólidas y tonos primarios saturados.'
              : 'Bold lines and saturated primary hues.',
          },
          linework: { weight: 'bold' },
          shading: { technique: 'whip', intensity: 'medium' },
          colour: {
            mode: 'colour',
            palette: ['crimson', 'forest_green', 'mustard_yellow', 'deep_black'],
          },
          placement: { bodyPart: 'upper_arm_outer', orientation: 'vertical', side: 'left' },
          size: { widthMm: 100, heightMm: 150 },
        },
        assistantReply: isSpanish
          ? 'Un diseño clásico de lobo aullando con daga en Tradicional Americano envejece extraordinariamente bien en la piel. Las líneas gruesas y el sombreado tipo barrido (whip) aseguran que se mantenga nítido de por vida. ¿Te parece bien un tamaño de unos 10 cm x 15 cm (100x150 mm) en la cara exterior del brazo?'
          : 'A classic howling wolf with a dagger in American Traditional style will age wonderfully. Bold lines and heavy whip shading keep it readable forever. Does approximately 100mm x 150mm on your upper outer arm sound right?',
      };
    }

    // Realism / Hyperrealism / Valencia CF / Mare de Déu
    if (
      allText.includes('realis') ||
      allText.includes('valencia') ||
      allText.includes('gemelo') ||
      allText.includes('senyera') ||
      allText.includes('desamparats')
    ) {
      const isPlacementKnown = allText.includes('gemelo');
      return {
        extractedSlots: {
          subject: {
            description:
              'Composición solemne del Valencia CF, la Senyera Valenciana y la Mare de Déu dels Desamparats',
            elements: [
              'Mare de Déu dels Desamparats en la cúspide',
              'Senyera Valenciana',
              'Escudo del Valencia CF con murciélago',
            ],
          },
          style: {
            primary: 'black_and_grey_realism',
            notes: isSpanish
              ? 'Hiperrealismo con texturas fieles, transiciones suaves y microdetalles protegidos.'
              : 'Hyperrealism with rich textures and smooth blends.',
          },
          linework: { weight: 'fine' },
          shading: { technique: 'smooth_blend', intensity: 'heavy' },
          colour: {
            mode: 'black_and_grey_with_accent',
            palette: ['negro carbón', 'gris medio', 'rojo carmesí', 'amarillo bandera'],
          },
          placement: {
            bodyPart: isPlacementKnown ? 'calf' : 'outer_forearm',
            orientation: 'vertical',
            side: 'right',
          },
          size: { widthMm: 140, heightMm: 260 },
        },
        readyForGeneration: true,
        assistantReply: isSpanish
          ? '¡Excelente! He preparado los parámetros ideales para tu diseño hiperrealista en el gemelo (14×26 cm, trazo fino, sombras suaves profundas y toques dinámicos en la Senyera). Ya podemos generar tanto la plantilla técnica de dibujo como el mockup hiperrealista en piel. ¿Te gustaría ver el resultado?'
          : 'Great choice! I have configured the ideal parameters for your hyperrealistic tattoo on the calf (140x260 mm). We are ready to generate both the stencil outline and the realistic skin mockup. Would you like to generate it now?',
      };
    }

    // Fallback turn: adapt to what is already known in turns
    return {
      extractedSlots: {
        subject: {
          description: lastTurn?.content ?? 'Concepto personalizado de tatuaje',
          elements: ['motivo principal'],
        },
      },
      assistantReply: isSpanish
        ? 'Entendido perfectamente. Para continuar definiendo tu diseño, ¿en qué zona exacta del cuerpo te gustaría llevarlo y qué tamaño aproximado imaginas (en centímetros o milímetros)?'
        : 'Understood. To help define your design, which body area would you prefer and what approximate dimensions (in cm or mm) do you envision?',
    };
  }
}
