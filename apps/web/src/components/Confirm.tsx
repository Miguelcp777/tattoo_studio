'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * One acceptance pop-up (TASK-0064): a question, what it is about, and its answers.
 *
 * A native `<dialog>` opened modally, like the design viewer, so the page behind cannot be used
 * meanwhile, focus stays inside, and Escape cancels.
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
}: {
  title: string;
  children?: ReactNode;
  actions: ConfirmAction[];
  onCancel: () => void;
  wide?: boolean;
}): ReactNode {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={
        wide ? 'studio-dialog confirm-dialog confirm-wide' : 'studio-dialog confirm-dialog'
      }
      aria-labelledby="confirm-title"
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
}
