import { useBrowseStore } from '@/stores/browse-store';
import { useT } from '@/hooks/useT';
import type {
  MangaDexContentRating,
  MangaDexDemographic,
  MangaDexStatus,
} from '@kireimanga/shared';

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
  const t = useT();
  const filters = useBrowseStore(s => s.filters);
  const toggleContentRating = useBrowseStore(s => s.toggleContentRating);
  const toggleDemographic = useBrowseStore(s => s.toggleDemographic);
  const toggleStatus = useBrowseStore(s => s.toggleStatus);
  const toggleLanguage = useBrowseStore(s => s.toggleLanguage);

  // Option lists are built inside the component so the labels resolve
  // against the current language each render — same pattern used by the
  // settings section and LibraryControls.
  const contentRatings: { value: MangaDexContentRating; label: string }[] = [
    { value: 'safe', label: t('series.rating.safe') },
    { value: 'suggestive', label: t('series.rating.suggestive') },
    { value: 'erotica', label: t('series.rating.erotica') },
  ];

  const demographics: { value: MangaDexDemographic; label: string }[] = [
    { value: 'shounen', label: t('series.demographic.shounen') },
    { value: 'shoujo', label: t('series.demographic.shoujo') },
    { value: 'seinen', label: t('series.demographic.seinen') },
    { value: 'josei', label: t('series.demographic.josei') },
  ];

  const statuses: { value: MangaDexStatus; label: string }[] = [
    { value: 'ongoing', label: t('series.status.ongoing') },
    { value: 'completed', label: t('series.status.completed') },
    { value: 'hiatus', label: t('series.status.hiatus') },
    { value: 'cancelled', label: t('series.status.cancelled') },
  ];

  const languages: { value: string; label: string }[] = [
    { value: 'en', label: t('browse.filter.language.en') },
    { value: 'pl', label: t('browse.filter.language.pl') },
    { value: 'ja', label: t('browse.filter.language.ja') },
  ];

  return (
    <div className="flex flex-col gap-3 border-b border-[var(--color-border)] pb-4">
      <div className="flex flex-wrap items-baseline gap-x-10 gap-y-3">
        <Group label={t('browse.filter.group.rating')}>
          {contentRatings.map(r => (
            <Chip
              key={r.value}
              active={filters.contentRating.includes(r.value)}
              onClick={() => toggleContentRating(r.value)}
            >
              {r.label}
            </Chip>
          ))}
        </Group>
        <Group label={t('browse.filter.group.demographic')}>
          {demographics.map(d => (
            <Chip
              key={d.value}
              active={filters.demographic.includes(d.value)}
              onClick={() => toggleDemographic(d.value)}
            >
              {d.label}
            </Chip>
          ))}
        </Group>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-10 gap-y-3">
        <Group label={t('browse.filter.group.status')}>
          {statuses.map(s => (
            <Chip
              key={s.value}
              active={filters.status.includes(s.value)}
              onClick={() => toggleStatus(s.value)}
            >
              {s.label}
            </Chip>
          ))}
        </Group>
        <Group label={t('browse.filter.group.language')}>
          {languages.map(l => (
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
    </div>
  );
}
