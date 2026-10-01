'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * One acceptance pop-up (TASK-0064): a question, what it is about, and its answers.
 *
 * By default a native `<dialog>` opened modally, like the design viewer, so the page behind cannot
 * be used meanwhile, focus stays inside, and Escape cancels.
 *
 * TASK-0066: `belowHeader` keeps the studio's header usable. A modal dialog makes everything else
 * inert, and the guided studio is a sequence of dialogs, so «Salir», «Panel» and «Modo avanzado»
 * were visible but could not be pressed. The dialog then opens non-modally under the header, over
 * a backdrop that covers only the page below it.
 */
export interface ConfirmAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}

export function Confirm({
  title,
  children,
  actions,
  onCancel,
  wide = false,
  belowHeader = false,
}: {
  title: string;
  children?: ReactNode;
  actions: ConfirmAction[];
  onCancel: () => void;
  wide?: boolean;
  belowHeader?: boolean;
}): ReactNode {
  const dialog = useRef<HTMLDialogElement>(null);
  // Where the header ends, so the dialog and its backdrop start below it at any width.
  const [top, setTop] = useState(0);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (!belowHeader) {
      if (!element.open) element.showModal();
      return () => element.close();
    }
    const measure = () =>
      setTop(
        Math.ceil(document.querySelector('.studio-header')?.getBoundingClientRect().bottom ?? 0),
      );
    measure();
    window.addEventListener('resize', measure);
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', escape);
    element.querySelector<HTMLElement>('textarea, button.btn-primary:not(:disabled)')?.focus();
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('keydown', escape);
    };
    // Opened once: `onCancel` changes identity on every render of the page, and the latest one is
    // not needed, since every step's cancel only changes which step is shown.
  }, [belowHeader]);
  const className = [
    'studio-dialog',
    'confirm-dialog',
    wide ? 'confirm-wide' : '',
    belowHeader ? 'confirm-below-header' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const body = (
    <dialog
      ref={dialog}
      open={belowHeader || undefined}
      className={className}
      style={belowHeader ? { top: top + 12, maxHeight: `calc(100dvh - ${top + 24}px)` } : undefined}
      aria-labelledby="confirm-title"
      aria-modal={belowHeader ? true : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id="confirm-title">{title}</h2>
      {children}
      <div className="confirm-actions">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className={action.primary ? 'btn-primary' : undefined}
            disabled={action.disabled}
            onClick={action.onClick}
          >
            {action.label}
          </button>
        ))}
      </div>
    </dialog>
  );
  if (!belowHeader) return body;
  return (
    <>
      <div className="confirm-backdrop" style={{ top }} aria-hidden="true" />
      {body}
    </>
  );
}
