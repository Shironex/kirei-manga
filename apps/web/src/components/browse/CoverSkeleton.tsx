interface Props {
  tall?: boolean;
}

/**
 * Ivory-tinted skeleton card. Slow opacity pulse — no shimmer, no translate.
 */
export function CoverSkeleton({ tall = false }: Props) {
  return (
    <div className={['flex flex-col', tall ? 'row-span-2' : ''].join(' ')}>
      <div className="skeleton-pulse aspect-[2/3] w-full rounded-[2px] bg-[var(--color-ink-raised)]" />
      <div className="mt-3 flex flex-col gap-2">
        <div className="skeleton-pulse h-3 w-[70%] rounded-[2px] bg-[var(--color-ink-raised)]" />
        <div className="skeleton-pulse h-2 w-[40%] rounded-[2px] bg-[var(--color-ink-raised)]" />
      </div>
    </div>
  );
}
