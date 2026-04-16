import { useLibraryViewStore, type LibraryViewMode } from '@/stores/library-view-store';

const MODES: { value: LibraryViewMode; label: string }[] = [
  { value: 'grid', label: 'Grid' },
  { value: 'list', label: 'List' },
];

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

  return (
    <div className="mb-6 flex items-center justify-end border-b border-[var(--color-border)] pb-3">
      <div className="flex items-center rounded-[2px] border border-[var(--color-rule)]">
        {MODES.map(m => (
          <Segment key={m.value} active={mode === m.value} onClick={() => setMode(m.value)}>
            {m.label}
          </Segment>
        ))}
      </div>
    </div>
  );
}
