import { useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { ExternalLink, KeyRound, LogOut } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SettingRow } from '@/features/settings/SettingRow';
import { isTauri } from '@/lib/ipc';
import { openMangaDex, signIn, signOut, toOnlineError, type SignInForm } from '@/lib/online';

import { setAccount, useAccount } from './account';
import { errorText } from './model';

/**
 * The MangaDex row of Settings > Accounts: who is signed in, sign out, and
 * the sign in form with a personal API client. The client secret and the
 * session go to the system keychain; the password is never stored.
 */
export function MangaDexAccount() {
  const account = useAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leave = async () => {
    setBusy(true);
    setError(null);
    try {
      setAccount(await signOut());
    } catch (reason) {
      setError(errorText(toOnlineError(reason)));
    } finally {
      setBusy(false);
    }
  };

  const signedIn = account.session === 'signedIn';
  const expired = account.session === 'expired';

  return (
    <div className="[&+&]:border-t [&+&]:border-line">
      <SettingRow
        id="account-mangadex"
        labelFor={false}
        label="MangaDex"
        help={
          signedIn
            ? `Signed in as ${account.username ?? 'your account'}. Follows, statuses and read markers sync both ways.`
            : expired
              ? `The session for ${account.username ?? 'your account'} has expired. Sign in again to resume syncing.`
              : 'Browsing works without an account. Sign in to follow series and get the updates feed.'
        }
        error={error}
        control={
          signedIn && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => void leave()}>
              <LogOut /> Sign out
            </Button>
          )
        }
      />
      {!account.keychain && (
        <p className="m-0 px-6 pb-4 text-sm text-warn">
          No system keychain is available, so the session lasts until KireiManga closes.
        </p>
      )}
      {!signedIn && isTauri() && (
        <SignIn clientId={account.clientId ?? ''} username={account.username ?? ''} />
      )}
    </div>
  );
}

function SignIn({ clientId, username }: { clientId: string; username: string }) {
  const [form, setForm] = useState<SignInForm>({
    clientId,
    clientSecret: '',
    username,
    password: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = (key: keyof SignInForm) => ({
    value: form[key],
    onChange: (event: ChangeEvent<HTMLInputElement>) =>
      setForm(current => ({ ...current, [key]: event.target.value })),
  });
  const ready = Object.values(form).every(value => value.trim() !== '');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      setAccount(await signIn(form));
      setForm(current => ({ ...current, password: '', clientSecret: '' }));
    } catch (reason) {
      const failure = toOnlineError(reason);
      setError(failure.kind === 'signIn' ? failure.message : errorText(failure));
      setForm(current => ({ ...current, password: '' }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      aria-label="Sign in to MangaDex"
      onSubmit={event => void submit(event)}
      className="grid gap-4 border-t border-line px-6 py-5"
    >
      <p className="m-0 text-sm text-fg-3">
        MangaDex signs in third party apps with a personal API client. Create one in your MangaDex
        settings, wait for it to be approved, then paste its id and secret here.{' '}
        <button
          type="button"
          onClick={() => void openMangaDex({ kind: 'apiClients' })}
          className="inline-flex items-center gap-1 text-accent underline-offset-2 hover:underline"
        >
          Open API clients <ExternalLink className="size-3.5" aria-hidden />
        </button>
      </p>
      <div className="grid grid-cols-2 gap-4">
        <Labelled id="md-client-id" label="Client id">
          <Input
            id="md-client-id"
            size="sm"
            autoComplete="off"
            spellCheck={false}
            {...field('clientId')}
          />
        </Labelled>
        <Labelled id="md-client-secret" label="Client secret">
          <Input
            id="md-client-secret"
            size="sm"
            type="password"
            autoComplete="off"
            {...field('clientSecret')}
          />
        </Labelled>
        <Labelled id="md-username" label="Username">
          <Input id="md-username" size="sm" autoComplete="username" {...field('username')} />
        </Labelled>
        <Labelled id="md-password" label="Password">
          <Input
            id="md-password"
            size="sm"
            type="password"
            autoComplete="current-password"
            {...field('password')}
          />
        </Labelled>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" size="sm" disabled={!ready || busy}>
          <KeyRound /> {busy ? 'Signing in' : 'Sign in'}
        </Button>
        <span className="text-xs text-fg-3">
          Your password goes to MangaDex once and is never stored.
        </span>
      </div>
      <p aria-live="polite" className="m-0 empty:hidden">
        {error && <span className="text-sm text-err">{error}</span>}
      </p>
    </form>
  );
}

function Labelled({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm text-fg-2">
        {label}
      </label>
      {children}
    </div>
  );
}
