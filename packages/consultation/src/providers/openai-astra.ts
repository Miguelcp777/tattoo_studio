import type { ConsultationSlots, ConsultationTurn } from '../types';
import type { ConsultationProvider, ProviderExtractionOutput } from './types';

export interface OpenAIAstraConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export class OpenAIAstraError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenAIAstraError';
  }
}

const SYSTEM_PROMPT = `You are an expert, empathetic tattoo artist conducting a design consultation with a client.
Your primary goal is to make tattoo design effortless, inspiring, and accessible for the client.

Client-Centric Philosophy:
- Do not overwhelm the client with technical jargon or endless questions.
- Based on their concept description and body location, proactively infer and recommend the optimal technical parameters:
  * Style (from the closed vocabulary below).
  * Linework weight (fine, medium, bold, or mixed) and shading technique (smooth_blend, whip, dotwork, solid_fill).
  * Color mode and palette: prefer rich dark tones, deep black shading with vibrant, attractive and dynamic contrasting accents.
  * Placement (bodyPart, orientation, side - e.g. right side of the back -> bodyPart: "upper_back", side: "right", orientation: "vertical").
  * Recommended physical size in millimetres (widthMm & heightMm) appropriate for that anatomy (e.g. calf: ~140x260mm; right side of upper back: ~180x280mm; outer forearm: ~100x200mm; chest: ~160x220mm).
- When subject, style, and body placement are identified, flag "readyForGeneration": true. Explain your recommendations warmly in Spanish and invite the client to generate both the stencil and the realistic body mockup!

Rules and Domain Invariants:
1. Closed Style Vocabulary: You must classify the client's style into one of the following:
   american_traditional, fine_line, black_and_grey_realism, neo_traditional, irezumi,
   blackwork, illustrative, ornamental, lettering, surrealism.
   (e.g. if the client asks for "hiper realista" or realistic portraits, map to "black_and_grey_realism").
2. Anti-Mimicry (PROD-INV-004): If the client asks for work in the style of a named living tattoo artist, you MUST refuse mimicry, explain why artist copyright and originality matter, and recommend the underlying style category instead.
3. Explicit Sizing: Tattoo size must be in millimetres (width and height between 5mm and 600mm). Proactively recommend ideal proportions if the client hasn't given exact measurements.
4. Reference Images: When provided, visually analyze linework weight, shading, motifs, and composition.
5. Tone: Professional, welcoming, exciting, and supportive.
6. Language: Conduct the consultation in fluent, natural Spanish.

OUTPUT FORMAT:
You MUST ALWAYS respond with a valid, clean JSON object matching this schema:
{
  "assistantReply": "Tu respuesta conversacional experta en español resumiendo tu propuesta y preguntando si desea generar el diseño",
  "readyForGeneration": true,
  "mimicryDetected": {
    "artistName": "Nombre del artista si intentan imitar a uno vivo",
    "suggestedStyle": "uno de los estilos permitidos",
    "explanation": "Explicación ética del rechazo de la copia"
  },
  "extractedSlots": {
    "subject": {
      "description": "Descripción concisa del tema",
      "elements": ["motivo 1", "motivo 2"]
    },
    "style": {
      "primary": "american_traditional | fine_line | black_and_grey_realism | neo_traditional | irezumi | blackwork | illustrative | ornamental | lettering | surrealism",
      "secondary": "opcional estilo secundario",
      "notes": "matices técnicos"
    },
    "linework": {
      "weight": "fine | medium | bold | mixed",
      "notes": "detalles del trazo"
    },
    "shading": {
      "technique": "none | whip | dotwork | smooth_blend | solid_fill | mixed",
      "intensity": "light | medium | heavy"
    },
    "colour": {
      "mode": "black_and_grey | colour | black_and_grey_with_accent",
      "palette": ["negro carbón", "gris sombra", "rojo carmesí", "dorado"]
    },
    "placement": {
      "bodyPart": "inner_forearm | outer_forearm | upper_arm_inner | upper_arm_outer | shoulder | collarbone | chest | sternum | ribs | stomach | upper_back | lower_back | spine | hip | thigh_front | thigh_outer | calf | shin | ankle | foot | wrist_inner | wrist_outer | hand | finger | neck | behind_ear",
      "orientation": "vertical | horizontal | diagonal | wrapping",
      "side": "left | right | centre"
    },
    "size": {
      "widthMm": 180,
      "heightMm": 280
    },
    "constraints": {
      "coverUp": false,
      "avoid": ["motivos a evitar"]
    }
  }
}`;

export class OpenAIAstraProvider implements ConsultationProvider {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(config: OpenAIAstraConfig = {}) {
    this.apiKey = config.apiKey ?? process.env['OPENAI_API_KEY'];
    this.baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
    this.model = config.model ?? 'gpt-6-astra';
  }

  async processTurn(
    turns: ConsultationTurn[],
    currentSlots?: ConsultationSlots,
  ): Promise<ProviderExtractionOutput> {
    if (!this.apiKey) {
      throw new OpenAIAstraError(
        'OPENAI_API_KEY is not configured. For testing without credentials, use FixtureConsultationProvider.',
      );
    }

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'system',
        content: `Slots extraídos acumulados hasta ahora: ${JSON.stringify(currentSlots ?? {})}`,
      },
      ...turns.map((turn) => this.formatTurn(turn)),
    ];

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        reasoning_effort: 'low',
        response_format: { type: 'json_object' },
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new OpenAIAstraError(
        `OpenAI Astra API error (${response.status} ${response.statusText}): ${errorText}`,
      );
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;
    if (!rawContent) {
      throw new OpenAIAstraError('Model did not return message content.');
    }

    try {
      const parsed = JSON.parse(rawContent);
      return {
        extractedSlots: parsed.extractedSlots ?? {},
        assistantReply:
          parsed.assistantReply ??
          'Entendido. ¿Deseas que preparemos tu diseño para generar la plantilla y el mockup real?',
        readyForGeneration: Boolean(parsed.readyForGeneration),
        mimicryDetected: parsed.mimicryDetected ?? undefined,
      };
    } catch (err) {
      throw new OpenAIAstraError(`Failed to parse Astra JSON response: ${String(err)}`);
    }
  }

  private formatTurn(turn: ConsultationTurn) {
    if (turn.role === 'assistant') {
      return { role: 'assistant', content: turn.content };
    }

    // Multimodal turn
    if (turn.referenceImages && turn.referenceImages.length > 0) {
      const contentParts: Array<
        { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
      > = [{ type: 'text', text: turn.content }];

      for (const img of turn.referenceImages) {
        contentParts.push({
          type: 'image_url',
          image_url: { url: img.source },
        });
      }

      return { role: 'user', content: contentParts };
    }

    return { role: 'user', content: turn.content };
  }
}
