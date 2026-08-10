import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "../hooks/useLanguage";

export interface OnboardingStep {
  // CSS selector for the element to spotlight, or null for a centered,
  // untargeted step — the fallback rendering (see the `rect` state below)
  // this component uses whenever a step's target isn't actually found, so
  // a step can also end up centered "for real" if `target` turns out not
  // to exist in the DOM (nothing currently in App.tsx's onboardingSteps
  // does this on purpose, but the component stays correct either way).
  target: string | null;
  title: string;
  body: string;
  // Runs once when this step becomes active — e.g. opening the accordion
  // section the step is about to point at.
  onEnter?: () => void;
  // Hides the Next/Finish button and waits for this selector to appear in
  // the DOM instead, then auto-advances — used for the "Afficher" step
  // (issue #31 follow-up): Layers/Export/Partage don't exist until the
  // user actually triggers a real display/compare, so rather than a fake
  // "Suivant" that skips right past that, the tour waits for the real
  // thing and continues once it happens. Skipped (rendered as a normal
  // step, Next shown immediately) if the selector already matches when
  // this step becomes active — e.g. after clicking "Précédent" back to it
  // once it's already been satisfied, which shouldn't re-trigger a wait.
  waitForSelector?: string;
}

interface Props {
  steps: OnboardingStep[];
  onFinish: () => void;
}

const CARD_WIDTH = 280;
// Real height varies with content, but the positioning math below only
// needs a reasonable estimate to keep the card from overflowing the
// viewport — a few px off either way just means slightly more/less margin,
// never actual clipping since real card content is short and fairly
// consistent across steps.
const CARD_HEIGHT_ESTIMATE = 170;
const MARGIN = 14;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

// Picks whichever side of the target has room for the card — right, then
// below, then left, then above — clamped to stay inside the viewport. The
// target elements live in the side panel on desktop (room to the right)
// and a bottom sheet on mobile (room above instead), so a single fixed
// side wouldn't work for both (see #panel's responsive layout in
// style.css).
function computeCardStyle(rect: DOMRect): CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (vw - rect.right >= CARD_WIDTH + MARGIN) {
    return { left: rect.right + MARGIN, top: clamp(rect.top, MARGIN, vh - CARD_HEIGHT_ESTIMATE - MARGIN) };
  }
  if (vh - rect.bottom >= CARD_HEIGHT_ESTIMATE + MARGIN) {
    return { left: clamp(rect.left, MARGIN, vw - CARD_WIDTH - MARGIN), top: rect.bottom + MARGIN };
  }
  if (rect.left >= CARD_WIDTH + MARGIN) {
    return { left: rect.left - CARD_WIDTH - MARGIN, top: clamp(rect.top, MARGIN, vh - CARD_HEIGHT_ESTIMATE - MARGIN) };
  }
  return { left: clamp(rect.left, MARGIN, vw - CARD_WIDTH - MARGIN), top: Math.max(MARGIN, rect.top - CARD_HEIGHT_ESTIMATE - MARGIN) };
}

function sameRect(a: DOMRect | null, b: DOMRect | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}

function measure(target: string | null): DOMRect | null {
  const el = target ? document.querySelector(target) : null;
  return el ? el.getBoundingClientRect() : null;
}

export function OnboardingTour({ steps, onFinish }: Props) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[index];
  // Guards onEnter so it only runs once per step activation — the
  // remeasure effect below deliberately has no dependency array (see its
  // own comment), so it re-runs on every render, including ones this
  // component doesn't control the cause of.
  const lastEnteredIndex = useRef(-1);

  useEffect(() => {
    if (lastEnteredIndex.current === index) return;
    lastEnteredIndex.current = index;
    step.onEnter?.();
  }, [index, step]);

  const [isWaiting, setIsWaiting] = useState(false);

  // Keyed on step.waitForSelector (a stable string), not `step` itself —
  // steps isn't memoized in App.tsx, so a plain `step` dependency would
  // tear down and recreate the observer on every unrelated parent
  // re-render (e.g. typing in the place search field) while sitting on
  // this step.
  useEffect(() => {
    const selector = step.waitForSelector;
    if (!selector || document.querySelector(selector)) {
      // No wait configured, or it's already satisfied (e.g. "Précédent"
      // back to a step whose real-world action already happened) — a
      // normal step, Next shown right away, no observer needed.
      setIsWaiting(false);
      return;
    }
    setIsWaiting(true);
    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) {
        observer.disconnect();
        setIsWaiting(false);
        setIndex((i) => i + 1);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [index, step.waitForSelector]);

  // No dependency array: re-measures after *every* commit, including the
  // one caused by step.onEnter's own state update (e.g. an accordion
  // opening) landing in the parent a render after this step became active
  // — a dependency array keyed just on `index` would measure too early,
  // before that DOM change has actually applied. Bailing out via the
  // functional update (returning the *same* previous rect when the
  // geometry hasn't actually changed) is what keeps this from looping:
  // getBoundingClientRect() always returns a fresh object, so an
  // unconditional setRect(next) here would never be reference-equal to
  // the previous state and would re-render forever.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const next = measure(step.target);
    setRect((prev) => (sameRect(prev, next) ? prev : next));
  });

  useEffect(() => {
    const onResize = () => setRect(measure(step.target));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [step.target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFinish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onFinish]);

  const isLast = index === steps.length - 1;

  return (
    <>
      {rect ? (
        <div
          className="onboarding-highlight"
          style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      ) : (
        <div className="onboarding-backdrop" />
      )}
      <div
        className={`modal onboarding-card${rect ? "" : " onboarding-card--centered"}`}
        style={rect ? computeCardStyle(rect) : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
      >
        <p className="onboarding-step-count">{t("onboardingStepCount", { current: index + 1, total: steps.length })}</p>
        <h3 id="onboarding-title">{step.title}</h3>
        <p>{step.body}</p>
        <div className="row onboarding-actions">
          <button type="button" className="btn-secondary" onClick={onFinish}>
            {t("onboardingSkip")}
          </button>
          {index > 0 && (
            <button type="button" className="btn-secondary" onClick={() => setIndex((i) => i - 1)}>
              {t("onboardingBack")}
            </button>
          )}
          {!isWaiting && (
            <button type="button" onClick={() => (isLast ? onFinish() : setIndex((i) => i + 1))}>
              {isLast ? t("onboardingFinish") : t("onboardingNext")}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
