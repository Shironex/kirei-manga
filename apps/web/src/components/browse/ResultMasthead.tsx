import type { SearchResult } from '@kireimanga/shared';

interface Props {
  results: SearchResult[];
}

/**
 * Editorial masthead featuring the top 1–2 results at large scale. Anything
 * beyond two entries is handed off to the grid below.
 */
export function ResultMasthead({ results }: Props) {
  const featured = results.slice(0, 2);
  if (featured.length === 0) return null;

  return (
    <section className="grid grid-cols-1 gap-10 md:grid-cols-[320px_1fr] md:gap-14">
      {featured.map((result, i) => (
        <article
          key={result.id}
          className={[
            'flex gap-6',
            i === 0 ? 'md:col-span-2 md:grid md:grid-cols-[320px_1fr] md:items-end' : '',
          ].join(' ')}
        >
          <div className="relative aspect-[2/3] w-full max-w-[320px] overflow-hidden rounded-[2px] bg-[var(--color-ink-sunken)]">
            {result.coverUrl && (
              <img src={result.coverUrl} alt="" className="h-full w-full object-cover" />
            )}
          </div>
          <div className="flex max-w-[48ch] flex-col">
            <span className="font-mono text-[10px] tracking-[0.26em] text-[var(--color-bone-faint)] uppercase">
              {i === 0 ? 'Top result' : 'Also notable'}
            </span>
            <h2 className="font-display mt-3 text-[clamp(1.75rem,3vw,2.5rem)] leading-[1.04] font-[350] tracking-[-0.02em] text-foreground italic">
              {result.title}
            </h2>
            {result.author && (
              <p className="mt-2 text-[13px] text-[var(--color-bone-muted)]">by {result.author}</p>
            )}
            {result.description && (
              <p className="mt-4 text-[13.5px] leading-relaxed text-muted-foreground line-clamp-4">
                {result.description}
              </p>
            )}
            <div className="mt-4 flex items-center gap-3 font-mono text-[10px] tracking-[0.2em] text-[var(--color-bone-faint)] uppercase">
              <span>{result.status}</span>
              {result.year && <span>· {result.year}</span>}
              {result.lastChapter && <span>· Ch. {result.lastChapter}</span>}
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}
