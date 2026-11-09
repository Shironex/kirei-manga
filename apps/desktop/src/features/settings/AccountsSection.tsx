import { LoaderCircle, LogIn, RefreshCw, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Segmented, SegmentedItem } from '@/components/ui/segmented';
import { Switch } from '@/components/ui/switch';
import { MangaDexAccount } from '@/features/online/MangaDexAccount';
import type { TrackingConflict } from '@/lib/settings/contract';
import { describeQueue, type AccountStatus } from '@/lib/tracking';

import { useAccount } from '../tracking/useAccount';
import { ConfirmButton } from './ConfirmButton';
import { SettingRow, SettingsList, SettingsSection, useSettingControl } from './SettingRow';

const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' });

function describeAccount(account: AccountStatus | null, waiting: boolean): string {
  if (!account) return 'Sync reading progress with your AniList list.';
  if (!account.configured) {
    return 'This build has no AniList client id, so it cannot sign in. See docs/tracking.md.';
  }
  if (waiting || account.signingIn) {
    return 'Approve KireiManga in the browser window that opened. This waits up to five minutes.';
  }
  if (!account.signedIn)
    return 'Sign in through your browser. KireiManga never sees your password.';
  const name = account.viewer ? `Signed in as ${account.viewer.name}` : 'Signed in';
  const until = account.expiresAt
    ? `; AniList asks again after ${dateFormat.format(account.expiresAt)}`
    : '';
  return `${name}${until}.`;
}

/** Settings > Accounts: the MangaDex sign in, the AniList sign in and how tracking behaves. */
export function AccountsSection() {
  const { account, queue, waiting, error, connect, cancel, disconnect, retry } = useAccount();
  const [enabled, setEnabled, enabledError] = useSettingControl('tracking.enabled');
  const [autoUpdate, setAutoUpdate, autoUpdateError] = useSettingControl('tracking.autoUpdate');
  const [conflict, setConflict, conflictError] = useSettingControl('tracking.conflict');
  const busy = waiting || account?.signingIn === true;
  const queueWaiting = queue ? queue.pending + queue.blocked + queue.failed : 0;

  return (
    <SettingsSection
      id="accounts"
      title="Accounts"
      lead="MangaDex and the trackers your reading is synced with. Secrets and sign in tokens stay in the system keychain."
    >
      <SettingsList className="mb-4">
        <MangaDexAccount />
      </SettingsList>
      <SettingsList>
        <SettingRow
          id="account-anilist"
          labelFor={false}
          label={
            <span className="flex items-center gap-3">
              {account?.viewer?.avatar ? (
                <img
                  src={account.viewer.avatar}
                  alt=""
                  className="size-7 shrink-0 rounded-full object-cover"
                />
              ) : null}
              AniList
            </span>
          }
          help={
            <span aria-live="polite" className="flex items-center gap-2">
              {busy && (
                <LoaderCircle
                  aria-hidden
                  className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
                />
              )}
              {describeAccount(account, waiting)}
            </span>
          }
          error={error}
          control={
            busy ? (
              <Button variant="ghost" size="sm" onClick={cancel}>
                <X /> Cancel
              </Button>
            ) : account?.signedIn ? (
              <ConfirmButton
                variant="ghost"
                size="sm"
                title="Sign out of AniList?"
                description="The token is removed from the keychain and updates still waiting are dropped. Series links stay, so signing in again picks up where you left off."
                confirmLabel="Sign out"
                onConfirm={() => void disconnect()}
              >
                Sign out
              </ConfirmButton>
            ) : (
              <Button
                variant="primary"
                size="sm"
                disabled={!account?.configured}
                aria-describedby="account-anilist-help"
                onClick={() => void connect()}
              >
                <LogIn /> Sign in
              </Button>
            )
          }
        />
        <SettingRow
          id="tracking-enabled"
          label="Track reading progress"
          help="Linked series send their progress to AniList, and AniList progress shows on the series page."
          error={enabledError}
          control={
            <Switch
              id="tracking-enabled"
              aria-describedby="tracking-enabled-help"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          }
        />
        <SettingRow
          id="tracking-auto"
          label="Update when a chapter is finished"
          help="Off, progress is only sent when you press Sync on the series page."
          error={autoUpdateError}
          control={
            <Switch
              id="tracking-auto"
              aria-describedby="tracking-auto-help"
              disabled={!enabled}
              checked={autoUpdate}
              onCheckedChange={setAutoUpdate}
            />
          }
        />
        <SettingRow
          id="tracking-conflict"
          labelFor={false}
          label="When AniList and this device disagree"
          help={
            conflict === 'higher'
              ? 'The higher progress wins. AniList is never moved back, so rereading an early chapter changes nothing there.'
              : 'AniList follows the chapter you last finished here, rereads included, unless it moved on another device since the last sync.'
          }
          error={conflictError}
          control={
            <Segmented
              aria-labelledby="tracking-conflict-label"
              value={conflict}
              onValueChange={v => v && setConflict(v as TrackingConflict)}
            >
              <SegmentedItem value="higher">Keep the higher</SegmentedItem>
              <SegmentedItem value="local">Follow this device</SegmentedItem>
            </Segmented>
          }
        />
        {queue && (
          <SettingRow
            id="tracking-queue"
            labelFor={false}
            label="Waiting to sync"
            help={<span aria-live="polite">{describeQueue(queue)}</span>}
            control={
              <Button
                variant="ghost"
                size="sm"
                disabled={queueWaiting === 0 || !account?.signedIn}
                aria-describedby="tracking-queue-help"
                onClick={() => void retry()}
              >
                <RefreshCw /> Retry now
              </Button>
            }
          />
        )}
      </SettingsList>
    </SettingsSection>
  );
}
