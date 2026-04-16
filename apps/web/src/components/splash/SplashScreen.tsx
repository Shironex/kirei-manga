import { useEffect, useMemo, useRef, useState } from 'react';
import mascotRead from '@/assets/chibi_read.png';

/** Minimum time the splash stays visible (ms). */
const MIN_DISPLAY_MS = 2200;
/** Duration of the fade-out exit animation (ms). */
const EXIT_ANIMATION_MS = 520;
/** Delay before showing the loading spinner (ms). */
const SPINNER_DELAY_MS = 700;
/** How often loading messages rotate (ms). */
const MESSAGE_ROTATE_MS = 1600;

/**
 * Editorial loading copy — serif ellipsis cadence, no exclamation marks, no
 * kawaii filler. Matches the `.impeccable.md` tone: literary, unhurried.
 * Polish primary (dev machine language); the mascot docs list an English
 * fallback set if we ever wire an i18n toggle in the splash itself.
 */
const LOADING_MESSAGES = [
  'Odkurzamy półki z mangą…',
  'Ostrzymy ołówki…',
  'Nalewamy herbatę…',
  'Przewracamy strony…',
  'Wyszukujemy rozdziały…',
  'Otwieramy okładki…',
  'Sortujemy zakładki…',
  'Kirei czyta cichutko…',
];

const FLAKE_COUNT = 8;

/**
 * Paper-flake particles — small bengara squares drifting down past the
 * mascot. Deterministic per mount (seeded by index + jitter) so each app
 * launch has a slightly different distribution without being random on every
 * render. Replaces ShiroAni's sparkle twinkle with something that reads as
 * "ink marks on a page" instead of "magical sparkles."
 */
interface Flake {
  id: number;
  x: number;
  size: number;
  delay: number;
  duration: number;
}

function useFlakes(): Flake[] {
  return useMemo(
    () =>
      Array.from({ length: FLAKE_COUNT }, (_, i) => {
        const jitter = (i * 37) % 100;
        return {
          id: i,
          x: -90 + ((jitter * 1.9) % 180),
          size: 2 + (i % 3),
          delay: (i * 0.35) % 3.2,
          duration: 3.6 + ((jitter * 0.04) % 1.6),
        };
      }),
    []
  );
}

function randomStart(): number {
  return Math.floor(Math.random() * LOADING_MESSAGES.length);
}

interface Props {
  ready: boolean;
  error: string | null;
  onDismissed?: () => void;
}

/**
 * KireiManga splash overlay. Covers the full viewport while the NestJS
 * backend finishes booting, then fades out over ~520 ms. Composition is
 * deliberately quieter than ShiroAni's pop splash:
 *   - solid sumi background (matches the app's dark theme root color)
 *   - one hairline bengara rule down the left edge, mirroring the sidebar's
 *     tategaki rail
 *   - mascot centered with a slow vertical float
 *   - 綺麗漫画 in Shippori Mincho serif + KIREIMANGA tracked mono underneath
 *   - paper-flake specks drift past the mascot instead of sparkles
 *   - a 4 px bengara ring + rotating serif-italic Polish copy once the
 *     spinner threshold elapses
 *
 * The component unmounts itself once `ready` flips true and the 2.2 s
 * minimum display has elapsed — so the consumer only renders it, never
 * needs to manually unmount.
 */
export function SplashScreen({ ready, error, onDismissed }: Props) {
  const [minElapsed, setMinElapsed] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [visible, setVisible] = useState(true);
  const [messageIndex, setMessageIndex] = useState(randomStart);
  const hasDismissedRef = useRef(false);
  const flakes = useFlakes();

  const shouldDismiss = ready && minElapsed;

  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), MIN_DISPLAY_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setShowSpinner(true), SPINNER_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (error) return;
    const t = setInterval(
      () => setMessageIndex(i => (i + 1) % LOADING_MESSAGES.length),
      MESSAGE_ROTATE_MS
    );
    return () => clearInterval(t);
  }, [error]);

  useEffect(() => {
    if (!shouldDismiss || hasDismissedRef.current) return;
    hasDismissedRef.current = true;
    setDismissing(true);
    const t = setTimeout(() => {
      setVisible(false);
      onDismissed?.();
    }, EXIT_ANIMATION_MS);
    return () => clearTimeout(t);
  }, [shouldDismiss, onDismissed]);

  if (!visible) return null;

  return (
    <div
      className={[
        'fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden',
        'bg-[var(--color-ink)] text-foreground',
        'transition-[opacity,transform] duration-500 ease-out',
        dismissing ? 'opacity-0' : 'opacity-100',
      ].join(' ')}
      role="status"
      aria-live="polite"
      aria-label="Loading KireiManga"
    >
      {/* Hairline bengara rule hugging the left edge — same motif the sidebar uses. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 bottom-0 left-[18px] w-px bg-[var(--color-accent)] opacity-30"
      />

      {/* Draggable region so the frameless Electron window still drags during splash. */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-8 app-drag" />

      <div className="relative flex flex-col items-center gap-6">
        {/* Mascot with a slow float + drifting paper-flake specks */}
        <div className="relative flex h-[180px] w-[180px] items-center justify-center">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            {flakes.map(flake => (
              <span
                key={flake.id}
                className="absolute top-0 left-1/2 block bg-[var(--color-accent)]"
                style={{
                  width: flake.size,
                  height: flake.size,
                  transform: `translateX(${flake.x}px)`,
                  animation: `splash-flake-drift ${flake.duration}s linear ${flake.delay}s infinite both`,
                  opacity: 0,
                }}
              />
            ))}
          </div>
          <img
            src={mascotRead}
            alt=""
            draggable={false}
            className="relative h-[160px] w-[160px] object-contain"
            style={{ animation: 'splash-float 3.4s ease-in-out infinite' }}
          />
        </div>

        <div
          className="flex flex-col items-center gap-1"
          style={{ animation: 'splash-fade-up 600ms ease-out 0.2s both' }}
        >
          <span className="font-kanji text-[28px] leading-none tracking-tight text-foreground">
            綺麗漫画
          </span>
          <span className="font-mono text-[10px] tracking-[0.28em] text-[var(--color-bone-faint)] uppercase">
            KireiManga
          </span>
        </div>

        <div
          className={[
            'flex min-h-[28px] items-center gap-3 transition-opacity duration-500',
            showSpinner ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
        >
          {error ? (
            <div className="flex flex-col items-center gap-2 px-8 text-center">
              <span className="font-mono text-[10px] tracking-[0.24em] text-[var(--color-accent)] uppercase">
                Something went sideways
              </span>
              <p className="max-w-[44ch] text-[13px] text-foreground">{error}</p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-2 font-mono text-[11px] tracking-[0.22em] text-[var(--color-bone-muted)] underline-offset-4 uppercase hover:text-foreground hover:underline"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              <span
                aria-hidden
                className="block h-3 w-3 shrink-0 rounded-full border border-[var(--color-accent)] border-t-transparent animate-spin"
                style={{ animationDuration: '1.2s' }}
              />
              <p
                key={messageIndex}
                className="font-display text-[13px] font-[380] text-[var(--color-bone-muted)] italic"
                style={{ animation: 'splash-msg-swap 420ms ease-out both' }}
              >
                {LOADING_MESSAGES[messageIndex]}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
