/**
 * What the studio says while an agent works (TASK-0069).
 *
 * Nothing here is tracked from the server: no provider reports how far along it is. The lines are
 * the stages each task goes through, shown on a timer, and the bar is a curve of the time spent
 * against the usual time of the task. Both exist so a long wait never looks like a frozen page;
 * the bar slows down and never reaches the end, so it cannot promise a finish it does not know.
 */
export type InkTask =
  'idea' | 'save' | 'search' | 'image' | 'accept' | 'reset' | 'preparing' | 'queued' | 'running';

interface Script {
  title: string;
  lines: string[];
  /** How long each line stays, in milliseconds. */
  every: number;
  /** The usual duration of the task, in milliseconds: the bar is at about 63% by then. */
  usual: number;
}

const SCRIPTS: Record<InkTask, Script> = {
  idea: {
    title: 'Estudiando tu idea',
    lines: [
      'Leyendo tu idea…',
      'Anotando el estilo, la zona y el tamaño…',
      'Redactando la descripción profesional…',
      'Buscando imágenes de referencia…',
      'Comprobando que las referencias encajan con tu idea…',
    ],
    every: 4500,
    usual: 20000,
  },
  save: {
    title: 'Guardando tus respuestas',
    lines: ['Anotando tus respuestas…', 'Ajustando la propuesta a la zona…'],
    every: 3000,
    usual: 3000,
  },
  search: {
    title: 'Buscando referencias',
    lines: [
      'Buscando imágenes de referencia…',
      'Descartando las que no encajan…',
      'Quedándonos con las mejores…',
    ],
    every: 5000,
    usual: 15000,
  },
  image: {
    title: 'Revisando tu imagen',
    lines: [
      'Subiendo la imagen…',
      'Quitando los datos de ubicación…',
      'Comprobando que es apta…',
      'Guardándola cifrada…',
    ],
    every: 2500,
    usual: 8000,
  },
  accept: {
    title: 'Preparando el encargo',
    lines: ['Fijando el resumen que has aceptado…'],
    every: 3000,
    usual: 3000,
  },
  reset: {
    title: 'Preparando una hoja en blanco',
    lines: ['Recogiendo la mesa…'],
    every: 3000,
    usual: 2000,
  },
  preparing: {
    title: 'Preparando el encargo',
    lines: ['Revisando las referencias…', 'Enviando el encargo al estudio…'],
    every: 5000,
    usual: 15000,
  },
  queued: {
    title: 'Tu diseño está en cola',
    lines: ['Esperando turno en el estudio…', 'Enseguida empezamos…'],
    every: 8000,
    usual: 30000,
  },
  running: {
    title: 'Tatuando tu diseño',
    lines: [
      'Dibujando el diseño…',
      'Trazando la plantilla línea a línea…',
      'Preparando la piel…',
      'Colocando el tatuaje sobre la piel…',
      'Repasando luces y sombras…',
      'Dando los últimos retoques…',
    ],
    every: 25000,
    usual: 150000,
  },
};

/** The bar never claims the end: it approaches this and stops there until the task is done. */
export const BAR_CEILING = 0.94;

export interface InkStage {
  title: string;
  line: string;
  /** From 0 to `BAR_CEILING`, growing with time and slowing down. */
  progress: number;
}

export function inkStage(task: InkTask, elapsedMs: number): InkStage {
  const script = SCRIPTS[task];
  const elapsed = Math.max(0, elapsedMs);
  // The lines advance and stay on the last one: going back to the first would look like a restart.
  const index = Math.min(script.lines.length - 1, Math.floor(elapsed / script.every));
  return {
    title: script.title,
    line: script.lines[index]!,
    progress: BAR_CEILING * (1 - Math.exp(-elapsed / script.usual)),
  };
}

/** «0:07», «2:31». */
export function clock(elapsedMs: number): string {
  const seconds = Math.floor(Math.max(0, elapsedMs) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
