import type { ReactNode } from "react";

interface Props {
  id?: string;
  title: string;
  open: boolean;
  onToggle: (open: boolean) => void;
  className?: string;
  children: ReactNode;
}

// Thin wrapper around a controlled <details>/<summary> — used for every
// collapsible panel section (Lieu, Dates & rendu, Export, Partage) so each
// section's open/closed state can be driven both by the user (clicking the
// summary) and programmatically (e.g. auto-opening Export once a compare
// finishes). `open` must be synced back via onToggle on every render or the
// browser's own toggle behavior fights the controlled prop.
export function AccordionSection({ id, title, open, onToggle, className, children }: Props) {
  return (
    <details
      id={id}
      className={`accordion-section${className ? ` ${className}` : ""}`}
      open={open}
      onToggle={(e) => onToggle(e.currentTarget.open)}
    >
      <summary className="section-title">{title}</summary>
      <div className="accordion-body">{children}</div>
    </details>
  );
}
