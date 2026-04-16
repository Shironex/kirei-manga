import { PageHeader } from '../components/layout/PageHeader';
import { AppearanceSection } from '../components/settings/AppearanceSection';
import { KeyboardSection } from '../components/settings/KeyboardSection';
import { LibrarySection } from '../components/settings/LibrarySection';
import { ReaderDefaultsSection } from '../components/settings/ReaderDefaultsSection';
import { useSettingsStore } from '../stores/settings-store';

export function SettingsPage() {
  const loaded = useSettingsStore(s => s.settings !== null);

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        kanji="設定"
        title="Everything, tuned to you."
        subtitle="KireiManga is local-first. Your library, keys, and translation cache never leave this machine unless you ask."
      />

      {!loaded ? (
        <div className="animate-fade-up flex flex-col gap-3 py-10">
          <div className="skeleton-pulse h-px w-full bg-border" />
          <div className="skeleton-pulse h-px w-full bg-border" />
          <div className="skeleton-pulse h-px w-full bg-border" />
        </div>
      ) : (
        <div className="animate-fade-up flex flex-col">
          <AppearanceSection />
          <ReaderDefaultsSection />
          <LibrarySection />
          <KeyboardSection />
        </div>
      )}
    </>
  );
}
