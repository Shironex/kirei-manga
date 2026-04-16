import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useT } from '@/hooks/useT';

interface Props {
  /**
   * Route to navigate to when no prior history entry exists — e.g. a user
   * who launched the app directly into a deep-linked detail page. Defaults
   * to the library root.
   */
  fallback?: string;
  className?: string;
}

/**
 * Editorial back chevron for nested pages (series detail, import flow).
 * Uses the same mono-eyebrow vocabulary as page headers so it recedes into
 * the layout until hovered. `navigate(-1)` when browser history exists, else
 * falls through to the fallback so the button is always meaningful.
 */
export function BackButton({ fallback = '/', className }: Props) {
  const t = useT();
  const navigate = useNavigate();

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(fallback);
    }
  };

  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label={t('common.back')}
      className={[
        'group inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.26em] text-[var(--color-bone-faint)] uppercase transition-colors hover:text-foreground',
        className ?? '',
      ].join(' ')}
    >
      <ChevronLeft
        className="h-3.5 w-3.5 stroke-[1.4] transition-transform group-hover:-translate-x-0.5"
        aria-hidden
      />
      {t('common.back')}
    </button>
  );
}
