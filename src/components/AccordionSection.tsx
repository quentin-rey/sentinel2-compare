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
// finishes, or closing this section because a sibling just opened — see
// App.tsx's single shared `openSection` state).
//
// Deliberately *not* using <details>'s native "toggle" event to read the
// new state back: setting the `open` DOM attribute (which is exactly what
// React does when a re-render flips this component's `open` prop) fires
// that same "toggle" event. With several accordions sharing one "which one
// is open" state, programmatically closing a sibling would then fire *its*
// toggle handler too, reporting open=false and stomping the state update
// that just opened a different section a moment earlier. Handling the
// click on <summary> directly instead, and preventing its default action,
// means only an actual user click ever changes the state.
export function AccordionSection({ id, title, open, onToggle, className, children }: Props) {
  return (
    <details id={id} className={`accordion-section${className ? ` ${className}` : ""}`} open={open}>
      <summary
        className="section-title"
        onClick={(e) => {
          e.preventDefault();
          onToggle(!open);
        }}
      >
        {title}
      </summary>
      <div className="accordion-body">{children}</div>
    </details>
  );
}
