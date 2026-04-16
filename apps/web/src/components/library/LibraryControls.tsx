import {
  useLibraryViewStore,
  type LibrarySort,
  type LibraryStatusFilter,
  type LibraryViewMode,
} from '@/stores/library-view-store';

const MODES: { value: LibraryViewMode; label: string }[] = [
  { value: 'grid', label: 'Grid' },
  { value: 'list', label: 'List' },
];

const STATUSES: { value: LibraryStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'reading', label: 'Reading' },
  { value: 'completed', label: 'Completed' },
  { value: 'planToRead', label: 'Plan to read' },
  { value: 'onHold', label: 'On hold' },
  { value: 'dropped', label: 'Dropped' },
];

const SORTS: { value: LibrarySort; label: string; disabled?: boolean }[] = [
  { value: 'title', label: 'Title' },
  { value: 'lastRead', label: 'Last read' },
  { value: 'dateAdded', label: 'Date added' },
  { value: 'progress', label: 'Progress', disabled: true },
];

interface ChipProps {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}

function Chip({ active, disabled, onClick, title, children }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={[
        'relative text-[12.5px] tracking-wide transition-colors',
        'px-0 py-1.5 mr-5 last:mr-0',
        disabled ? 'pointer-events-none opacity-50' : '',
        active ? 'text-foreground' : 'text-[var(--color-bone-muted)] hover:text-foreground',
      ].join(' ')}
    >
      <span>{children}</span>
      {active && (
        <span
          aria-hidden
          className="absolute right-0 -bottom-px left-0 block h-px bg-[var(--color-accent)]"
        />
      )}
    </button>
  );
}

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
  const mode = useLibraryViewStore(s => s.mode);
  const setMode = useLibraryViewStore(s => s.setMode);
  const sort = useLibraryViewStore(s => s.sort);
  const setSort = useLibraryViewStore(s => s.setSort);
  const sortDir = useLibraryViewStore(s => s.sortDir);
  const toggleSortDir = useLibraryViewStore(s => s.toggleSortDir);
  const statusFilter = useLibraryViewStore(s => s.statusFilter);
  const setStatusFilter = useLibraryViewStore(s => s.setStatusFilter);

  return (
    <div className="mb-6 flex flex-col gap-5 border-b border-[var(--color-border)] pb-6">
      <div className="flex items-start justify-between gap-6">
        <Group label="Status">
          {STATUSES.map(s => (
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
          {MODES.map(m => (
            <Segment key={m.value} active={mode === m.value} onClick={() => setMode(m.value)}>
              {m.label}
            </Segment>
          ))}
        </div>
      </div>
      <div className="flex items-baseline gap-4">
        <Group label="Sort">
          {SORTS.map(s => (
            <Chip
              key={s.value}
              active={sort === s.value}
              disabled={s.disabled}
              onClick={() => setSort(s.value)}
              title={s.disabled ? 'Available after Slice E' : undefined}
            >
              {s.label}
            </Chip>
          ))}
        </Group>
        <button
          type="button"
          onClick={toggleSortDir}
          aria-label={sortDir === 'asc' ? 'Sort ascending' : 'Sort descending'}
          className="font-mono text-[11px] leading-none text-[var(--color-bone-muted)] transition-colors hover:text-foreground"
        >
          {sortDir === 'asc' ? '▲' : '▼'}
        </button>
      </div>
    </div>
  );
}
