import { Chip } from '@/components/ui/chip';
import { Switch } from '@/components/ui/switch';
import { LanguagePicker } from '@/features/online/LanguagePicker';
import { toggleRating } from '@/features/online/model';
import type { ContentRating } from '@/lib/settings/contract';

import { SettingRow, SettingsList, SettingsSection, useSettingControl } from './SettingRow';

const RATINGS: { value: ContentRating; label: string }[] = [
  { value: 'safe', label: 'Safe' },
  { value: 'suggestive', label: 'Suggestive' },
  { value: 'erotica', label: 'Erotica' },
  { value: 'pornographic', label: 'Pornographic' },
];

/** MangaDex: languages, content ratings, data saver and the updates feed. */
export function OnlineSection() {
  const [ratings, setRatings, ratingsError] = useSettingControl('online.contentRatings');
  const [dataSaver, setDataSaver, dataSaverError] = useSettingControl('online.dataSaver');
  const [notify, setNotify, notifyError] = useSettingControl('online.notifications');
  const [auto, setAuto, autoError] = useSettingControl('online.autoRefresh');

  return (
    <SettingsSection
      id="online"
      title="MangaDex"
      lead="What browsing, series pages and the updates feed show. Chapters in your preferred language come first; a fallback fills the gaps and is always named."
    >
      <SettingsList>
        <div className="px-6 py-4">
          <span className="mb-3 block font-medium">Chapter languages</span>
          <LanguagePicker />
        </div>
        <SettingRow
          id="online-ratings"
          labelFor={false}
          label="Content ratings"
          help="Series MangaDex rates outside these never show up. Safe and suggestive by default."
          error={ratingsError}
          control={
            <div role="group" aria-labelledby="online-ratings-label" className="flex gap-1.5">
              {RATINGS.map(rating => (
                <Chip
                  key={rating.value}
                  pressed={ratings.includes(rating.value)}
                  onPressedChange={() => setRatings(toggleRating(ratings, rating.value))}
                >
                  {rating.label}
                </Chip>
              ))}
            </div>
          }
        />
        <SettingRow
          id="online-data-saver"
          label="Data saver"
          help="Smaller, compressed pages from MangaDex@Home. Faster on a slow connection, softer on screen."
          error={dataSaverError}
          control={
            <Switch id="online-data-saver" checked={dataSaver} onCheckedChange={setDataSaver} />
          }
        />
        <SettingRow
          id="online-auto"
          label="Check for new chapters"
          help="Every 30 minutes while signed in. Waits longer when MangaDex asks to slow down."
          error={autoError}
          control={<Switch id="online-auto" checked={auto} onCheckedChange={setAuto} />}
        />
        <SettingRow
          id="online-notify"
          label="Notify me of new chapters"
          help="A system notification when followed series get chapters in your languages."
          error={notifyError}
          control={<Switch id="online-notify" checked={notify} onCheckedChange={setNotify} />}
        />
      </SettingsList>
    </SettingsSection>
  );
}
