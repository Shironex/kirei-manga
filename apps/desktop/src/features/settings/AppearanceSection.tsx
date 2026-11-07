import { Segmented, SegmentedItem } from '@/components/ui/segmented';
import { Switch } from '@/components/ui/switch';
import type { MotionPreference, ThemeStrength } from '@/lib/settings/contract';

import { SettingRow, SettingsList, SettingsSection, useSettingControl } from './SettingRow';

export function AppearanceSection() {
  const [strength, setStrength, strengthError] = useSettingControl('appearance.strength');
  const [coverColours, setCoverColours, coverColoursError] =
    useSettingControl('appearance.coverColours');
  const [ambient, setAmbient, ambientError] = useSettingControl('appearance.ambient');
  const [glass, setGlass, glassError] = useSettingControl('appearance.glass');
  const [motion, setMotion, motionError] = useSettingControl('appearance.motion');

  return (
    <SettingsSection
      id="appearance"
      title="Appearance"
      lead="The interface takes its colour from the cover you are looking at. Turn it down or off here."
    >
      <SettingsList>
        <SettingRow
          id="pref-cover-colours"
          label="Cover colours"
          help="Tint the interface with the cover you are looking at. Off keeps the default accent."
          error={coverColoursError}
          control={
            <Switch
              id="pref-cover-colours"
              aria-describedby="pref-cover-colours-help"
              checked={coverColours}
              onCheckedChange={setCoverColours}
            />
          }
        />
        <SettingRow
          id="pref-strength"
          labelFor={false}
          label="Strength"
          help="How much colour the cover is allowed to bring in."
          error={strengthError}
          control={
            <Segmented
              aria-labelledby="pref-strength-label"
              value={strength}
              onValueChange={v => setStrength(v as ThemeStrength)}
            >
              <SegmentedItem value="subtle">Subtle</SegmentedItem>
              <SegmentedItem value="balanced">Balanced</SegmentedItem>
              <SegmentedItem value="vivid">Vivid</SegmentedItem>
            </Segmented>
          }
        />
        <SettingRow
          id="pref-ambient"
          label="Ambient backdrop"
          help="A soft glow of the cover colour behind the page header."
          error={ambientError}
          control={
            <Switch
              id="pref-ambient"
              aria-describedby="pref-ambient-help"
              checked={ambient}
              onCheckedChange={setAmbient}
            />
          }
        />
        <SettingRow
          id="pref-glass"
          label="Glass panels"
          help="Frosted reader toolbars. Off uses solid surfaces, like reduced transparency."
          error={glassError}
          control={
            <Switch
              id="pref-glass"
              aria-describedby="pref-glass-help"
              checked={glass}
              onCheckedChange={setGlass}
            />
          }
        />
        <SettingRow
          id="pref-motion"
          labelFor={false}
          label="Motion"
          help="System follows the reduced motion setting of your OS."
          error={motionError}
          control={
            <Segmented
              aria-labelledby="pref-motion-label"
              aria-describedby="pref-motion-help"
              value={motion}
              onValueChange={v => setMotion(v as MotionPreference)}
            >
              <SegmentedItem value="system">System</SegmentedItem>
              <SegmentedItem value="reduced">Reduced</SegmentedItem>
              <SegmentedItem value="full">Full</SegmentedItem>
            </Segmented>
          }
        />
      </SettingsList>
    </SettingsSection>
  );
}
