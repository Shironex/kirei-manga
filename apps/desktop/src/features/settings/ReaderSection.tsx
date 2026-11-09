import { Segmented, SegmentedItem } from '@/components/ui/segmented';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type {
  PageFit,
  ReaderMode,
  ReadingDirection,
  ResampleFilter,
} from '@/lib/settings/contract';

import { SettingRow, SettingsList, SettingsSection, useSettingControl } from './SettingRow';

const FILTERS: { value: ResampleFilter; label: string }[] = [
  { value: 'lanczos3', label: 'Lanczos3' },
  { value: 'mitchell', label: 'Mitchell' },
  { value: 'nearest', label: 'Nearest' },
];

export function ReaderSection() {
  const [mode, setMode, modeError] = useSettingControl('reader.mode');
  const [direction, setDirection, directionError] = useSettingControl('reader.direction');
  const [fit, setFit, fitError] = useSettingControl('reader.fit');
  const [filter, setFilter, filterError] = useSettingControl('reader.filter');
  const [spreads, setSpreads, spreadsError] = useSettingControl('reader.detectSpreads');
  const [webtoon, setWebtoon, webtoonError] = useSettingControl('reader.detectWebtoon');
  const [split, setSplit, splitError] = useSettingControl('reader.splitTall');

  return (
    <SettingsSection
      id="reader"
      title="Reader"
      lead="Defaults for every series that has no reader settings of its own yet."
    >
      <SettingsList>
        <SettingRow
          id="pref-mode"
          labelFor={false}
          label="Default mode"
          help="Single and double turn pages; webtoon scrolls one long strip."
          error={modeError}
          control={
            <Segmented
              aria-labelledby="pref-mode-label"
              value={mode}
              onValueChange={v => setMode(v as ReaderMode)}
            >
              <SegmentedItem value="single">Single</SegmentedItem>
              <SegmentedItem value="double">Double</SegmentedItem>
              <SegmentedItem value="webtoon">Webtoon</SegmentedItem>
            </Segmented>
          }
        />
        <SettingRow
          id="pref-direction"
          labelFor={false}
          label="Direction"
          help="Page order for single and double page modes."
          error={directionError}
          control={
            <Segmented
              aria-labelledby="pref-direction-label"
              value={direction}
              onValueChange={v => setDirection(v as ReadingDirection)}
            >
              <SegmentedItem value="rtl">Right to left</SegmentedItem>
              <SegmentedItem value="ltr">Left to right</SegmentedItem>
            </Segmented>
          }
        />
        <SettingRow
          id="pref-fit"
          labelFor={false}
          label="Page fit"
          help="How a page is sized against the window."
          error={fitError}
          control={
            <Segmented
              aria-labelledby="pref-fit-label"
              value={fit}
              onValueChange={v => setFit(v as PageFit)}
            >
              <SegmentedItem value="screen">Screen</SegmentedItem>
              <SegmentedItem value="width">Width</SegmentedItem>
              <SegmentedItem value="height">Height</SegmentedItem>
              <SegmentedItem value="original">Original</SegmentedItem>
            </Segmented>
          }
        />
        <SettingRow
          id="pref-filter"
          label="Resampling"
          help="Pages are resized in Rust before they reach the screen."
          error={filterError}
          control={
            <Select value={filter} onValueChange={v => setFilter(v as ResampleFilter)}>
              <SelectTrigger id="pref-filter" aria-describedby="pref-filter-help" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILTERS.map(f => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
        <SettingRow
          id="pref-spreads"
          label="Detect spreads"
          help="Show wide pages alone in double page mode."
          error={spreadsError}
          control={
            <Switch
              id="pref-spreads"
              aria-describedby="pref-spreads-help"
              checked={spreads}
              onCheckedChange={setSpreads}
            />
          }
        />
        <SettingRow
          id="pref-webtoon"
          label="Detect webtoons"
          help="Open chapters of tall strips in webtoon mode, unless you picked a mode for that series."
          error={webtoonError}
          control={
            <Switch
              id="pref-webtoon"
              aria-describedby="pref-webtoon-help"
              checked={webtoon}
              onCheckedChange={setWebtoon}
            />
          }
        />
        <SettingRow
          id="pref-split"
          label="Split tall pages"
          help="In single and double page modes at screen fit, show a tall strip one screen at a time instead of shrinking it."
          error={splitError}
          control={
            <Switch
              id="pref-split"
              aria-describedby="pref-split-help"
              checked={split}
              onCheckedChange={setSplit}
            />
          }
        />
      </SettingsList>
    </SettingsSection>
  );
}
