/**
 * What the studio restores when it opens (TASK-0046).
 *
 * Before designs belonged to the account, the answer was simple: no consultation meant nothing to
 * show, because the work was owned by the same browser session that held the conversation. Now
 * they are two different things. A device that has just signed in has designs and no conversation,
 * and it must show them rather than an empty studio.
 *
 * The branch lives here rather than inside the page's effect so it can be checked without a
 * browser.
 */

/** The answer `GET /api/consultation` gives, reduced to what the decision depends on. */
export interface StudioEntry {
  session: unknown;
  jobId?: string | undefined;
}

export type Opening =
  /** Signed in, nothing in progress: load the account's designs and open the newest. */
  | { restore: 'designs'; jobId: null }
  /** A consultation is in progress in this browser; `jobId` is the generation it left running. */
  | { restore: 'conversation'; jobId: string | null };

export function openingFor(entry: StudioEntry): Opening {
  if (!entry.session) return { restore: 'designs', jobId: null };
  return { restore: 'conversation', jobId: entry.jobId ?? null };
}

/**
 * Whether the newest stored design should be reopened once the history arrives.
 *
 * Never while a generation is still running: the design on screen would be replaced by an older
 * one halfway through making its successor.
 */
export function reopensNewest(opening: Opening, jobState?: string): boolean {
  if (opening.restore === 'designs') return true;
  return jobState !== 'queued' && jobState !== 'running';
}
