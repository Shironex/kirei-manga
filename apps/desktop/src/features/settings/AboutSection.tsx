import { useState } from 'react';
import { ExternalLink, FileText } from 'lucide-react';

import kireiFull from '@/assets/kirei/full.webp';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { describeAppInfo, isTauri, type AppInfo } from '@/lib/ipc';
import { getThirdPartyNotices, openLink, type ExternalLink as Link } from '@/lib/settings/commands';

import { SettingsSection } from './SettingRow';

const LINKS: { link: Link; label: string }[] = [
  { link: 'website', label: 'kireimanga.app' },
  { link: 'repository', label: 'Source on GitHub' },
  { link: 'issues', label: 'Report a problem' },
];

type NoticesState = { kind: 'loading' } | { kind: 'text'; text: string } | { kind: 'missing' };

function NoticesDialog() {
  const [notices, setNotices] = useState<NoticesState>({ kind: 'loading' });

  const load = (open: boolean) => {
    if (!open || notices.kind !== 'loading') return;
    if (!isTauri()) {
      setNotices({ kind: 'missing' });
      return;
    }
    getThirdPartyNotices().then(
      text => setNotices(text ? { kind: 'text', text } : { kind: 'missing' }),
      () => setNotices({ kind: 'missing' })
    );
  };

  return (
    <Dialog onOpenChange={load}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <FileText /> Third party notices
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[min(820px,calc(100vw-32px))]">
        <DialogHeader>
          <DialogTitle>Third party notices</DialogTitle>
          <DialogDescription>
            Licences of the open source crates, packages and fonts KireiManga is built with.
          </DialogDescription>
        </DialogHeader>
        {notices.kind === 'text' ? (
          <pre
            tabIndex={0}
            aria-label="Third party notices text"
            className="m-0 max-h-[60vh] overflow-auto rounded-lg border border-line bg-ink-0 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-fg-2"
          >
            {notices.text}
          </pre>
        ) : notices.kind === 'missing' ? (
          <p className="m-0 text-sm text-fg-2">
            This build does not carry the notices file.{' '}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void openLink('notices').catch(() => {})}
            >
              Read it on GitHub <ExternalLink />
            </Button>
          </p>
        ) : (
          <p className="m-0 text-sm text-fg-3">Loading…</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AboutSection({ info }: { info: AppInfo | null }) {
  return (
    <SettingsSection id="about" title="About">
      <div className="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-8 rounded-panel border border-line bg-ink-1 p-6">
        <img
          src={kireiFull}
          alt="Kirei, the KireiManga mascot, reading"
          draggable={false}
          className="aspect-square w-[140px] object-contain"
        />
        <div className="min-w-0">
          <p lang="ja" className="m-0 font-jp text-2xl font-semibold tracking-[0.06em]">
            綺麗漫画
          </p>
          <p className="m-0 mt-1.5 text-sm text-fg-2">
            {info ? `${describeAppInfo(info)}.` : 'KireiManga, running in a browser preview.'}{' '}
            Tauri, Rust and React. Kirei keeps you company while the scanner works.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {LINKS.map(({ link, label }) => (
              <Button
                key={link}
                variant="quiet"
                size="sm"
                className="text-accent"
                onClick={() => void openLink(link).catch(() => {})}
              >
                {label} <ExternalLink />
              </Button>
            ))}
            <NoticesDialog />
          </div>
        </div>
      </div>
    </SettingsSection>
  );
}
