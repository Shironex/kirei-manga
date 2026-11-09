import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { CloudOff, Hourglass, KeyRound, ShieldAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { useAccount } from './account';
import { healthMessage } from './model';

/** Re-renders every second while a countdown is on screen. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/**
 * The line above every online screen when something is off: MangaDex
 * unreachable, rate limited (with the countdown), refusing this network, or
 * the session expired. Nothing when all is well.
 */
export function OnlineStatus({ className }: { className?: string }) {
  const account = useAccount();
  const limited = account.health.state === 'rateLimited';
  const now = useNow(limited);
  const health = healthMessage(account.health, now);
  const expired = account.session === 'expired';
  if (!health && !expired) return null;

  const Icon = expired
    ? KeyRound
    : account.health.state === 'offline'
      ? CloudOff
      : limited
        ? Hourglass
        : ShieldAlert;
  return (
    <div
      role="status"
      className={cn(
        'mb-6 flex flex-wrap items-center gap-3 rounded-panel border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-fg-1',
        className
      )}
    >
      <Icon className="size-4 shrink-0 text-warn" aria-hidden />
      <span className="min-w-0 flex-1">
        {expired
          ? 'Your MangaDex session has expired, so follows and read markers are not syncing.'
          : health}
      </span>
      {expired && (
        <Button variant="secondary" size="sm" asChild>
          <Link to="/settings" search={{ section: 'accounts' }}>
            Sign in again
          </Link>
        </Button>
      )}
    </div>
  );
}

/** "Data from MangaDex" with a link, shown on every online screen. */
export function MangaDexCredit({ className }: { className?: string }) {
  return (
    <p className={cn('m-0 text-xs text-fg-3', className)}>
      Series, chapters and covers come from <span className="font-medium text-fg-2">MangaDex</span>{' '}
      and the scanlation groups credited on each chapter. KireiManga shows no ads.
    </p>
  );
}
