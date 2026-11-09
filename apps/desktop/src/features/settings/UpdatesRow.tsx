import { Download, LoaderCircle, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { describeUpdate } from '@/lib/updater';

import { SettingRow, SettingsList } from './SettingRow';
import { useUpdater } from './useUpdater';

/** The About section's Updates row: the result of the last check and what to do next. */
export function UpdatesRow() {
  const { state, check, install } = useUpdater();
  const busy = state.step === 'checking' || state.step === 'installing';
  const available =
    state.step === 'checked' && state.check.kind === 'available' ? state.check : null;
  const disabled = state.step === 'checked' && state.check.kind === 'disabled';

  return (
    <SettingsList className="mt-4">
      <SettingRow
        id="settings-updates"
        label="Updates"
        labelFor={false}
        help={
          <span aria-live="polite" className="flex items-center gap-2">
            {busy && (
              <LoaderCircle
                aria-hidden
                className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
              />
            )}
            {describeUpdate(state)}
          </span>
        }
        control={
          available ? (
            <Button
              variant="primary"
              size="sm"
              aria-describedby="settings-updates-help"
              onClick={() => install(available.version)}
            >
              <Download /> Install and restart
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              aria-describedby="settings-updates-help"
              disabled={busy || disabled}
              onClick={check}
            >
              <RefreshCw /> Check again
            </Button>
          )
        }
      />
    </SettingsList>
  );
}
