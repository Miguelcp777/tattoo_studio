'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { clock, inkStage, type InkStep, type InkTask } from '@/lib/ink-progress';

/**
 * While an agent works (TASK-0069): a gloved hand tattoos a rose on skin, line by line, with the
 * stage, a bar and the time spent beneath it. It is there so a wait of seconds or minutes never
 * reads as a frozen page. What it says is what the server reports, or else a plain description
 * with an indeterminate bar (`ink-progress.ts`, TASK-0076).
 *
 * `delay` keeps a quick answer from flashing it. With reduced motion the rose is shown finished
 * and the hand still; the text and the time still move.
 */

// One continuous path, so the needle can follow it: the spiral, the cup, two leaves, the stem.
const ROSE =
  'M150 128 c5 -5 13 -2 11 5 c-2 7 -15 8 -18 0 c-4 -10 6 -18 17 -17 c13 1 19 13 14 24 ' +
  'c-6 11 -23 13 -33 5 c-10 -8 -10 -24 1 -32 c9 -7 23 -6 31 2 ' +
  'M128 136 c2 12 11 19 22 19 c11 0 20 -7 22 -19 ' +
  'M124 146 c-15 -2 -26 -13 -26 -28 c12 3 21 10 26 19 ' +
  'M176 146 c15 -3 24 -15 24 -29 c-12 3 -20 10 -24 19 ' +
  'M150 155 c0 5 -1 8 -4 11';
const CYCLE = '7s';

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const change = () => setReduced(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  return reduced;
}

function TattooingHand({ still }: { still: boolean }): ReactNode {
  // Ids are per instance: the advanced panel and a dialog can both show one.
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const ref = (name: string) => `${name}-${id}`;
  const url = (name: string) => `url(#${ref(name)})`;
  const draw = still ? null : (
    <animate
      attributeName="stroke-dashoffset"
      values="1;0;0"
      keyTimes="0;0.78;1"
      dur={CYCLE}
      repeatCount="indefinite"
    />
  );
  return (
    <svg className="ink-art" viewBox="0 0 320 170" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={ref('skin')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9ad92" />
          <stop offset="1" stopColor="#9c6d55" />
        </linearGradient>
        <linearGradient id={ref('metal')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8f6553" />
          <stop offset="0.45" stopColor="#f1d2bf" />
          <stop offset="1" stopColor="#9c705d" />
        </linearGradient>
        <linearGradient id={ref('glove')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2b2f3b" />
          <stop offset="1" stopColor="#121419" />
        </linearGradient>
        <filter id={ref('blur')} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
        <path id={ref('rose')} pathLength={1} d={ROSE} />
      </defs>

      {/* Skin, with a soft light along its edge. */}
      <path d="M-10 102 C 80 88, 230 88, 330 104 L 330 180 L -10 180 Z" fill={url('skin')} />
      <path
        d="M-10 102 C 80 88, 230 88, 330 104"
        fill="none"
        stroke="#f3d6c4"
        strokeOpacity="0.35"
        strokeWidth="1.5"
      />

      {/* The rose: the redness of fresh ink under the line, then the line. */}
      <g>
        <use
          href={`#${ref('rose')}`}
          fill="none"
          stroke="#c0464f"
          strokeOpacity="0.35"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray="1 1"
          strokeDashoffset={still ? 0 : 1}
          filter={url('blur')}
        >
          {draw}
        </use>
        <use
          href={`#${ref('rose')}`}
          fill="none"
          stroke="#14161c"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="1 1"
          strokeDashoffset={still ? 0 : 1}
        >
          {draw}
        </use>
        {!still && (
          <animate
            attributeName="opacity"
            values="1;1;0;0"
            keyTimes="0;0.88;0.97;1"
            dur={CYCLE}
            repeatCount="indefinite"
          />
        )}
      </g>

      {/* The hand follows the line with the needle; it lifts when the rose is done. */}
      <g transform={still ? 'translate(161 133)' : undefined}>
        {!still && (
          <animateMotion
            dur={CYCLE}
            repeatCount="indefinite"
            keyPoints="0;1;1"
            keyTimes="0;0.78;1"
            calcMode="linear"
          >
            <mpath href={`#${ref('rose')}`} />
          </animateMotion>
        )}
        <g>
          {!still && (
            <animateTransform
              attributeName="transform"
              type="translate"
              values="0 0;0 0;7 -12;7 -12;0 0"
              keyTimes="0;0.78;0.84;0.95;1"
              dur={CYCLE}
              repeatCount="indefinite"
            />
          )}
          <circle r="2.2" fill="#14161c" opacity="0.6">
            {!still && (
              <animate attributeName="r" values="1.4;2.6;1.4" dur="0.3s" repeatCount="indefinite" />
            )}
          </circle>
          <g>
            {/* The machine's buzz. */}
            {!still && (
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0 0;0.6 -0.5;-0.5 0.4;0 0"
                dur="0.12s"
                repeatCount="indefinite"
              />
            )}
            <g transform="rotate(32)">
              <path
                d="M28 -116 L 40 -230"
                stroke={url('glove')}
                strokeWidth="40"
                strokeLinecap="round"
              />
              <path
                d="M4 -60 C 22 -58 48 -70 52 -96 C 56 -118 40 -132 20 -130 C 6 -128 -4 -116 -6 -100 Z"
                fill={url('glove')}
              />
              <path
                d="M36 -72 C 32 -52 22 -38 9 -32"
                fill="none"
                stroke="#1a1d25"
                strokeWidth="10"
                strokeLinecap="round"
              />
              <path
                d="M0 -120 C 0 -150 30 -160 60 -200"
                fill="none"
                stroke="#0b0c10"
                strokeWidth="3"
              />
              <rect x="-8" y="-122" width="16" height="64" rx="6" fill={url('metal')} />
              <rect x="-8" y="-100" width="16" height="3" fill="#7a5546" opacity="0.6" />
              <rect x="-7" y="-58" width="14" height="36" rx="4" fill="#23262f" />
              <path
                d="M-7 -52 h14 M-7 -46 h14 M-7 -40 h14 M-7 -34 h14"
                stroke="#3a3f4d"
                strokeWidth="1.4"
              />
              <path
                d="M-5 -22 L 5 -22 L 2.5 -6 L -2.5 -6 Z"
                fill="#c9d3dc"
                fillOpacity="0.55"
                stroke="#e7edf2"
                strokeOpacity="0.6"
                strokeWidth="0.8"
              />
              <path d="M0 -6 L 0 0" stroke="#e7edf2" strokeWidth="1.2" />
              <path
                d="M6 -80 C -2 -66 -8 -50 -8 -36"
                fill="none"
                stroke={url('glove')}
                strokeWidth="12"
                strokeLinecap="round"
              />
              <path
                d="M3 -76 C -3 -64 -7 -52 -8 -40"
                fill="none"
                stroke="#4a5060"
                strokeWidth="1.2"
                strokeLinecap="round"
                opacity="0.7"
              />
              <path
                d="M26 -78 C 22 -60 14 -48 8 -42"
                fill="none"
                stroke="#20232c"
                strokeWidth="11"
                strokeLinecap="round"
              />
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}

export function InkWorking({
  task,
  stage: step,
  queuePosition,
  delay = 400,
  note,
}: {
  task: InkTask;
  /** The step the worker reports for a running design (TASK-0076). */
  stage?: InkStep | undefined;
  /** Its place in the queue, for a queued design. */
  queuePosition?: number | undefined;
  /** Milliseconds before it appears, so a quick answer does not flash it. */
  delay?: number;
  /** A line under the time, such as how long a design usually takes. */
  note?: string;
}): ReactNode {
  const still = useReducedMotion();
  const box = useRef<HTMLElement>(null);
  const [started] = useState(() => Date.now());
  const [now, setNow] = useState(started);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  const elapsed = now - started;
  const shown = elapsed >= delay;
  // Brought into sight once, since it may appear below a long dialog on a phone.
  useEffect(() => {
    if (shown) box.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [shown]);
  if (!shown) return null;

  // TASK-0076 (audit UX-03): only what the server reports; nothing advances on a clock.
  const stage = inkStage(task, { stage: step, queuePosition });
  return (
    <section ref={box} className="ink-working" aria-busy="true" aria-label={stage.title}>
      <TattooingHand still={still} />
      <p className="ink-title" role="status">
        {stage.title}
      </p>
      <p className="ink-line" key={stage.line}>
        {stage.line}
      </p>
      {stage.progress === null ? (
        <div className="ink-bar ink-bar-waiting" role="progressbar" aria-label={stage.title}>
          <span />
        </div>
      ) : (
        <div
          className="ink-bar"
          role="progressbar"
          aria-label={stage.title}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(stage.progress * 100)}
        >
          <span style={{ width: `${(stage.progress * 100).toFixed(1)}%` }} />
        </div>
      )}
      <p className="ink-time">
        {clock(elapsed)}
        {note ? ` · ${note}` : ''}
      </p>
    </section>
  );
}
