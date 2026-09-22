'use client';

import { useRef, type ChangeEvent, type ReactNode } from 'react';
import type { ReferenceImage, ReferenceImageMimeType } from '@tattoo/consultation';

export interface ReferenceUploaderProps {
  references: ReferenceImage[];
  onChange: (refs: ReferenceImage[]) => void;
  disabled?: boolean | undefined;
}

const ALLOWED_MIMES: ReferenceImageMimeType[] = ['image/jpeg', 'image/png', 'image/webp'];

export function ReferenceUploader({
  references,
  onChange,
  disabled,
}: ReferenceUploaderProps): ReactNode {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newRefs: ReferenceImage[] = [...references];
    const file = files[0];
    if (!file) return;

    if (!ALLOWED_MIMES.includes(file.type as ReferenceImageMimeType)) {
      alert('Por favor sube una imagen válida en formato JPEG, PNG o WebP.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      newRefs.push({
        source: dataUrl,
        mimeType: file.type as ReferenceImageMimeType,
        label: file.name.replace(/\.[^/.]+$/, ''),
      });
      onChange(newRefs);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsDataURL(file);
  };

  const handleRemove = (index: number) => {
    const updated = references.filter((_, i) => i !== index);
    onChange(updated);
  };

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        id="reference-file-input"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={handleFileChange}
        disabled={disabled}
      />

      {references.length > 0 && (
        <div className="upload-tray" id="reference-preview-tray">
          {references.map((ref, idx) => (
            <div key={idx} className="upload-pill">
              <img src={ref.source} alt={ref.label ?? 'Referencia visual'} />
              <span>{ref.label ?? `Referencia ${idx + 1}`}</span>
              <button
                type="button"
                className="upload-pill-remove"
                id={`remove-ref-${idx}`}
                onClick={() => handleRemove(idx)}
                aria-label="Eliminar imagen de referencia"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
