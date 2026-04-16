import {
  useLibraryViewStore,
  type LibrarySort,
  type LibrarySourceFilter,
  type LibraryStatusFilter,
  type LibraryViewMode,
} from '@/stores/library-view-store';
import { useT } from '@/hooks/useT';
import { Chip } from '@/components/ui/Chip';

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-4">
      <span className="font-mono text-[10px] tracking-[0.24em] text-[var(--color-bone-faint)] uppercase">
        {label}
      </span>
      <div className="flex flex-wrap items-baseline">{children}</div>
    </div>
  );
}

interface SegmentProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function Segment({ active, onClick, children }: SegmentProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'relative px-3 py-1.5 text-[11px] font-mono tracking-[0.22em] uppercase transition-colors',
        active ? 'text-foreground' : 'text-[var(--color-bone-muted)] hover:text-foreground',
      ].join(' ')}
    >
      <span>{children}</span>
      {active && (
        <span
          aria-hidden
          className="absolute right-2 -bottom-px left-2 block h-px bg-[var(--color-accent)]"
        />
      )}
    </button>
  );
}

export function LibraryControls() {
  const t = useT();
  const mode = useLibraryViewStore(s => s.mode);
  const setMode = useLibraryViewStore(s => s.setMode);
  const sort = useLibraryViewStore(s => s.sort);
  const setSort = useLibraryViewStore(s => s.setSort);
  const sortDir = useLibraryViewStore(s => s.sortDir);
  const toggleSortDir = useLibraryViewStore(s => s.toggleSortDir);
  const statusFilter = useLibraryViewStore(s => s.statusFilter);
  const setStatusFilter = useLibraryViewStore(s => s.setStatusFilter);
  const sourceFilter = useLibraryViewStore(s => s.sourceFilter);
  const setSourceFilter = useLibraryViewStore(s => s.setSourceFilter);

  // Option arrays live inside the component so their labels go through `t()`
  // each render — matches the settings pattern.
  const modes: { value: LibraryViewMode; label: string }[] = [
    { value: 'grid', label: t('library.view.grid') },
    { value: 'list', label: t('library.view.list') },
  ];

  const statuses: { value: LibraryStatusFilter; label: string }[] = [
    { value: 'all', label: t('library.filter.all') },
    { value: 'reading', label: t('library.filter.reading') },
    { value: 'completed', label: t('library.filter.completed') },
    { value: 'planToRead', label: t('library.filter.planToRead') },
    { value: 'onHold', label: t('library.filter.onHold') },
    { value: 'dropped', label: t('library.filter.dropped') },
  ];

  const sources: { value: LibrarySourceFilter; label: string }[] = [
    { value: 'all', label: t('library.source.all') },
    { value: 'mangadex', label: t('library.source.mangadex') },
    { value: 'local', label: t('library.source.local') },
  ];

  const sorts: { value: LibrarySort; label: string; disabled?: boolean }[] = [
    { value: 'title', label: t('library.sort.title') },
    { value: 'lastRead', label: t('library.sort.lastRead') },
    { value: 'dateAdded', label: t('library.sort.dateAdded') },
    { value: 'progress', label: t('library.sort.progress'), disabled: true },
  ];

  return (
    <div className="mb-5 flex flex-col gap-3 border-b border-[var(--color-border)] pb-4">
      <div className="flex items-start justify-between gap-6">
        <Group label={t('library.groupLabel.status')}>
          {statuses.map(s => (
            <Chip
              key={s.value}
              active={statusFilter === s.value}
              onClick={() => setStatusFilter(s.value)}
            >
              {s.label}
            </Chip>
          ))}
        </Group>
        <div className="flex items-center rounded-[2px] border border-[var(--color-rule)]">
          {modes.map(m => (
            <Segment key={m.value} active={mode === m.value} onClick={() => setMode(m.value)}>
              {m.label}
            </Segment>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3">
        <Group label={t('library.groupLabel.source')}>
          {sources.map(s => (
            <Chip
              key={s.value}
              active={sourceFilter === s.value}
              onClick={() => setSourceFilter(s.value)}
            >
              {s.label}
            </Chip>
          ))}
        </Group>
        <div className="flex items-baseline gap-3">
          <Group label={t('library.groupLabel.sort')}>
            {sorts.map(s => (
              <Chip
                key={s.value}
                active={sort === s.value}
                disabled={s.disabled}
                onClick={() => setSort(s.value)}
                title={s.disabled ? t('library.sort.disabledHint') : undefined}
              >
                {s.label}
              </Chip>
            ))}
          </Group>
          <button
            type="button"
            onClick={toggleSortDir}
            aria-label={sortDir === 'asc' ? t('library.sort.ariaAsc') : t('library.sort.ariaDesc')}
            className="font-mono text-[11px] leading-none text-[var(--color-bone-muted)] transition-colors hover:text-foreground"
          >
            {sortDir === 'asc' ? '▲' : '▼'}
          </button>
        </div>
      </div>
    </div>
  );
}
