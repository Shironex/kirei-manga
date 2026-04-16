import { useEffect, useRef } from 'react';

interface Props {
  onVisible: () => void;
  disabled?: boolean;
  rootMargin?: string;
}

export function InfiniteSentinel({ onVisible, disabled, rootMargin = '600px' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onVisible);
  callbackRef.current = onVisible;

  useEffect(() => {
    if (disabled) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) callbackRef.current();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [disabled, rootMargin]);

  return <div ref={ref} aria-hidden className="h-px w-full" />;
}
