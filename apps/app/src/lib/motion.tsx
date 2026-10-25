// Imported only by client components.
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { type ReactNode, type RefObject, useLayoutEffect, useRef } from "react";

gsap.registerPlugin(useGSAP);
// A page has only some of the targets (no stripe on a card); missing ones are fine.
gsap.config({ nullTargetWarn: false });

// Every effect runs only under this query: reduced motion (and jsdom, whose matchMedia never matches) gets the final DOM.
const MOTION = "(prefers-reduced-motion: no-preference)";

/**
 * Arrival motion for the element the ref lands on, played once on mount, never on a refetch:
 *   [data-title]   rises out of its overflow-hidden parent
 *   [data-stripe]  the red stripe wipes in along its transform origin
 *   [data-rise]    staggers up and in (rows, cards, panels)
 * Mount it where the data has arrived (inside QueryState's children) so it plays as the content lands.
 */
export function useArrival<T extends HTMLElement>(ready = true): RefObject<T | null> {
  const ref = useRef<T>(null);
  const played = useRef(false);
  useGSAP(
    () => {
      // `ready` waits for children that mount later than this element (the panel grid measures first).
      if (!ready || played.current) return;
      played.current = true;
      gsap.matchMedia().add(MOTION, () => {
        gsap.from("[data-title]", { yPercent: 110, duration: 0.9, ease: "expo.out" });
        gsap.from("[data-stripe]", { scaleX: 0, duration: 0.8, ease: "expo.out", delay: 0.1 });
        gsap.from("[data-stripe-y]", { scaleY: 0, duration: 0.8, ease: "expo.out", delay: 0.1 });
        // ponytail: a fixed total stagger, so a 20-row table arrives as fast as a 3-row one.
        gsap.from("[data-rise]", { y: 14, autoAlpha: 0, duration: 0.55, ease: "power3.out", stagger: { amount: 0.35 }, clearProps: "transform,opacity,visibility" });
      });
    },
    { scope: ref, dependencies: [ready] },
  );
  return ref;
}

/** A div that plays useArrival on its contents: for render props, where a hook can't go. */
export function Arrive({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useArrival<HTMLDivElement>();
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/**
 * A number that counts up from zero on first mount. React keeps owning the text node: the tween writes
 * its nodeValue and finishes on whatever the latest value is, so a refetch mid-count still ends right.
 */
export function CountUp({ value, format = String }: { value: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const latest = useRef({ value, format });
  useLayoutEffect(() => {
    latest.current = { value, format };
  });
  useGSAP(
    () => {
      const text = ref.current?.firstChild;
      if (!text) return;
      gsap.matchMedia().add(MOTION, () => {
        const o = { v: 0 };
        gsap.to(o, {
          v: value,
          duration: 0.9,
          ease: "power2.out",
          onUpdate: () => void (text.nodeValue = latest.current.format(Math.round(o.v))),
          onComplete: () => void (text.nodeValue = latest.current.format(latest.current.value)),
        });
      });
    },
    { scope: ref },
  );
  return <span ref={ref}>{format(value)}</span>;
}

/** Text whose changed characters roll in from above (the countdown's digits). */
export function Rolling({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(text);
  // Plain tweens, not useGSAP: this ticks every second for hours, and a context would keep every one.
  useLayoutEffect(() => {
    const before = prev.current;
    prev.current = text;
    if (before === text || !window.matchMedia(MOTION).matches) return;
    const changed = [...(ref.current?.children ?? [])].filter((_, i) => before[i] !== text[i]);
    gsap.from(changed, { yPercent: -100, opacity: 0, duration: 0.25, ease: "power2.out" });
  }, [text]);
  return (
    <span ref={ref} className="inline-flex overflow-hidden">
      {[...text].map((c, i) => (
        // Keyed by place, so a changed digit is the same element with new text.
        <span key={i} className="inline-block whitespace-pre">
          {c}
        </span>
      ))}
    </span>
  );
}
