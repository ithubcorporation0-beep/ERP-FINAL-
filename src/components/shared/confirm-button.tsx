"use client";

import { useId, useRef } from "react";

interface ConfirmButtonProps {
  label: string;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
}

/** Button that opens a modal <dialog> and only runs `onConfirm` after explicit confirmation. */
export function ConfirmButton({ label, title, description, confirmLabel = "Confirm", onConfirm, disabled }: ConfirmButtonProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  async function confirm() {
    dialogRef.current?.close();
    await onConfirm();
  }

  return (
    <>
      <button type="button" disabled={disabled} onClick={() => dialogRef.current?.showModal()}>
        {label}
      </button>
      <dialog ref={dialogRef} aria-labelledby={titleId} aria-describedby={descId}>
        <h2 id={titleId} style={{ marginTop: 0, fontSize: 18 }}>{title}</h2>
        <p id={descId}>{description}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={() => dialogRef.current?.close()} autoFocus>
            Cancel
          </button>
          <button type="button" onClick={confirm}>
            {confirmLabel}
          </button>
        </div>
      </dialog>
    </>
  );
}
