import { useEffect, useRef } from 'react';

export function useLandingReveal() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (
      !rootRef.current ||
      typeof IntersectionObserver === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return;
    }

    const elements = rootRef.current.querySelectorAll<HTMLElement>(
      '[data-landing-reveal]',
    );
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let observer: IntersectionObserver | undefined;

    function observe() {
      observer?.disconnect();
      if (motion.matches) return;

      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            (entry.target as HTMLElement).dataset.landingReveal = 'visible';
            observer?.unobserve(entry.target);
          }
        },
        { threshold: 0.12 },
      );
      for (const element of elements) observer.observe(element);
    }

    observe();
    motion.addEventListener('change', observe);
    return () => {
      observer?.disconnect();
      motion.removeEventListener('change', observe);
    };
  }, []);

  return rootRef;
}
