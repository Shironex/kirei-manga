import { useBrowseStore } from '@/stores/browse-store';
import type {
  MangaDexContentRating,
  MangaDexDemographic,
  MangaDexStatus,
} from '@kireimanga/shared';

const CONTENT_RATINGS: { value: MangaDexContentRating; label: string }[] = [
  { value: 'safe', label: 'Safe' },
  { value: 'suggestive', label: 'Suggestive' },
  { value: 'erotica', label: 'Erotica' },
];

const DEMOGRAPHICS: { value: MangaDexDemographic; label: string }[] = [
  { value: 'shounen', label: 'Shōnen' },
  { value: 'shoujo', label: 'Shōjo' },
  { value: 'seinen', label: 'Seinen' },
  { value: 'josei', label: 'Josei' },
];

const STATUSES: { value: MangaDexStatus; label: string }[] = [
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'completed', label: 'Completed' },
  { value: 'hiatus', label: 'Hiatus' },
  { value: 'cancelled', label: 'Cancelled' },
];

const LANGUAGES: { value: string; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'pl', label: 'Polish' },
  { value: 'ja', label: 'Japanese' },
];

interface ChipProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function Chip({ active, onClick, children }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'relative text-[12.5px] tracking-wide transition-colors',
        'px-0 py-1.5 mr-5 last:mr-0',
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

export function FilterChips() {
  const filters = useBrowseStore(s => s.filters);
  const toggleContentRating = useBrowseStore(s => s.toggleContentRating);
  const toggleDemographic = useBrowseStore(s => s.toggleDemographic);
  const toggleStatus = useBrowseStore(s => s.toggleStatus);
  const toggleLanguage = useBrowseStore(s => s.toggleLanguage);

  return (
    <div className="flex flex-col gap-5 border-b border-[var(--color-border)] pb-6">
      <Group label="Rating">
        {CONTENT_RATINGS.map(r => (
          <Chip
            key={r.value}
            active={filters.contentRating.includes(r.value)}
            onClick={() => toggleContentRating(r.value)}
          >
            {r.label}
          </Chip>
        ))}
      </Group>
      <Group label="Demographic">
        {DEMOGRAPHICS.map(d => (
          <Chip
            key={d.value}
            active={filters.demographic.includes(d.value)}
            onClick={() => toggleDemographic(d.value)}
          >
            {d.label}
          </Chip>
        ))}
      </Group>
      <Group label="Status">
        {STATUSES.map(s => (
          <Chip
            key={s.value}
            active={filters.status.includes(s.value)}
            onClick={() => toggleStatus(s.value)}
          >
            {s.label}
          </Chip>
        ))}
      </Group>
      <Group label="Language">
        {LANGUAGES.map(l => (
          <Chip
            key={l.value}
            active={filters.availableTranslatedLanguage.includes(l.value)}
            onClick={() => toggleLanguage(l.value)}
          >
            {l.label}
          </Chip>
        ))}
      </Group>
    </div>
  );
}
