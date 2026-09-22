'use client';

/**
 * Guided progress rail (TASK-0026). Presentation only: it derives its state from the session
 * the page already holds and owns no rule of its own (WEB-INV-001).
 */

export type StepState = 'done' | 'current' | 'pending';

export interface Step {
  id: string;
  label: string;
  hint: string;
  state: StepState;
  optional?: boolean;
}

export interface StepFlowProps {
  steps: Step[];
  onSelect?: (id: string) => void;
}

const STATE_LABEL: Record<StepState, string> = {
  done: 'completado',
  current: 'en curso',
  pending: 'pendiente',
};

export function StepFlow({ steps, onSelect }: StepFlowProps): React.JSX.Element {
  const done = steps.filter((step) => step.state === 'done').length;
  return (
    <nav className="step-flow" aria-label="Progreso del diseño">
      <p className="step-flow-summary">
        <span className="step-flow-count">
          {done} de {steps.length}
        </span>{' '}
        pasos completados
      </p>
      <ol className="step-flow-list">
        {steps.map((step, index) => (
          <li key={step.id} className={`step-item is-${step.state}`}>
            <button
              type="button"
              className="step-button"
              aria-current={step.state === 'current' ? 'step' : undefined}
              onClick={() => onSelect?.(step.id)}
            >
              <span className="step-marker" aria-hidden="true">
                {step.state === 'done' ? '✓' : index + 1}
              </span>
              <span className="step-text">
                <span className="step-label">
                  {step.label}
                  {step.optional && <span className="step-optional"> · opcional</span>}
                </span>
                <span className="step-hint">{step.hint}</span>
              </span>
              <span className="visually-hidden">{STATE_LABEL[step.state]}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
