import type { Series } from '@kireimanga/shared';
import { Link, useNavigate } from 'react-router-dom';
import { relativeFromIso } from '@/lib/relativeTime';

interface Props {
  series: Series[];
}

function toIso(value: Date | string | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  const t = d.getTime();
  return Number.isFinite(t) ? d.toISOString() : null;
}

export function LibraryList({ series }: Props) {
  const navigate = useNavigate();
  if (series.length === 0) return null;
  return (
    <div className="border-t border-[var(--color-rule)]">
      {/* header row */}
      <div className="grid grid-cols-[3rem_1fr_8rem_6rem_8rem_5rem] items-center gap-4 border-b border-[var(--color-rule)] px-2 py-2 font-mono text-[10px] tracking-[0.22em] text-[var(--color-bone-faint)] uppercase">
        <span />
        <span>Title</span>
        <span>Last chapter</span>
        <span>Progress</span>
        <span>Last read</span>
        <span />
      </div>
      {series.map(entry => {
        const lastReadIso = toIso(entry.lastReadAt);
        return (
          <div
            key={entry.id}
            role="link"
            tabIndex={0}
            onClick={() => navigate(`/series/${entry.mangadexId}`)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                navigate(`/series/${entry.mangadexId}`);
              }
            }}
            className="grid cursor-pointer grid-cols-[3rem_1fr_8rem_6rem_8rem_5rem] items-center gap-4 border-b border-[var(--color-rule)] px-2 py-2 transition-colors last:border-b-0 hover:bg-[var(--color-ink-raised)] focus:outline-none focus-visible:bg-[var(--color-ink-raised)]"
          >
            <div className="aspect-[2/3] w-12 overflow-hidden rounded-[2px] bg-[var(--color-ink-sunken)]">
              {entry.coverPath ? (
                <img
                  src={entry.coverPath}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <span className="font-kanji text-[18px] leading-none text-[var(--color-bone-faint)] opacity-50">
                    綺
                  </span>
                </div>
              )}
            </div>
            <div className="min-w-0">
              <div className="font-display flex items-center truncate text-[14px] leading-snug font-[380] tracking-[-0.01em] text-foreground">
                <span className="truncate">{entry.title}</span>
                {entry.newChapterCount != null && entry.newChapterCount > 0 && (
                  <span className="ml-2 inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] px-1 text-[9px] font-mono text-[var(--color-accent-foreground)]">
                    {entry.newChapterCount}
                  </span>
                )}
              </div>
              {entry.titleJapanese && (
                <div className="mt-0.5 truncate font-mono text-[10px] tracking-[0.14em] text-[var(--color-bone-faint)]">
                  {entry.titleJapanese}
                </div>
              )}
            </div>
            {/* TODO(slice-e): last chapter */}
            <span className="font-mono text-[11px] tracking-[0.14em] text-[var(--color-bone-muted)]">
              —
            </span>
            {/* TODO(slice-e): progress */}
            <span className="font-mono text-[11px] tracking-[0.14em] text-[var(--color-bone-muted)]">
              —
            </span>
            <span className="font-mono text-[11px] tracking-[0.14em] text-[var(--color-bone-muted)]">
              {lastReadIso ? relativeFromIso(lastReadIso) : '—'}
            </span>
            {entry.mangadexId && entry.lastChapterId ? (
              <Link
                to={`/reader/${entry.mangadexId}/${entry.lastChapterId}`}
                onClick={e => e.stopPropagation()}
                className="justify-self-end font-mono text-[10.5px] tracking-[0.22em] text-[var(--color-bone-muted)] uppercase hover:text-[var(--color-accent)]"
              >
                Continue
              </Link>
            ) : (
              <span />
            )}
          </div>
        );
      })}
    </div>
  );
}
