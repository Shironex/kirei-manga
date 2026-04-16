import { Search } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import mascotRead from '@/assets/chibi_read.png';
import { useBrowseStore } from '@/stores/browse-store';
import { useLibraryViewStore } from '@/stores/library-view-store';
import { useT } from '@/hooks/useT';
import { WindowControls } from './WindowControls';

export function TopBar() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const browseQuery = useBrowseStore(s => s.query);
  const setBrowseQuery = useBrowseStore(s => s.setQuery);
  const libraryQuery = useLibraryViewStore(s => s.query);
  const setLibraryQuery = useLibraryViewStore(s => s.setQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  const onLibrary = location.pathname === '/';
  const query = onLibrary ? libraryQuery : browseQuery;
  const setQuery = onLibrary ? setLibraryQuery : setBrowseQuery;

  // Cmd+K / Ctrl+K focuses the top search input from anywhere.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (!onLibrary && location.pathname !== '/browse') {
          navigate('/browse');
        }
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, location.pathname, onLibrary]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (onLibrary) return;
    if (location.pathname !== '/browse') {
      navigate('/browse');
    }
  };

  const isMac = typeof window !== 'undefined' && window.electronAPI?.platform === 'darwin';

  return (
    <header
      className="app-drag relative flex h-12 shrink-0 items-center gap-6 border-b border-border bg-background pr-4"
      style={{ paddingLeft: isMac ? 84 : 24 }}
    >
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center overflow-hidden">
          <img
            src={mascotRead}
            alt=""
            aria-hidden
            className="h-7 w-7 object-contain"
          />
        </div>
        <span className="font-display text-[13px] font-medium tracking-[0.02em] text-foreground">
          KireiManga
        </span>
      </div>

      <div className="app-no-drag ml-auto flex items-center gap-4">
        <form
          onSubmit={handleSubmit}
          className="group flex h-8 w-[280px] items-center gap-2 rounded-sm border border-border bg-[var(--color-ink-sunken)] px-2.5 transition-colors focus-within:border-[var(--color-accent)]"
        >
          <Search className="h-3.5 w-3.5 stroke-[1.4] text-[var(--color-bone-faint)] transition-colors group-focus-within:text-[var(--color-accent)]" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={
              onLibrary ? t('topbar.placeholder.library') : t('topbar.placeholder.global')
            }
            className="flex-1 bg-transparent text-[12px] tracking-wide text-foreground placeholder:text-[var(--color-bone-faint)] focus:outline-none"
            style={{ outline: 'none' }}
          />
          <kbd className="font-mono text-[9px] tracking-wider text-[var(--color-bone-faint)]">
            Cmd/Ctrl+K
          </kbd>
        </form>

        <span aria-hidden className="h-4 w-px bg-[var(--color-border)]" />
        <span className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-bone-faint)] uppercase">
          {t('topbar.status.offline')}
        </span>
        <WindowControls />
      </div>
    </header>
  );
}
