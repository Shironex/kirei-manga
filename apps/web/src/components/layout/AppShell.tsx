import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function AppShell() {
  const location = useLocation();
  const isReader = location.pathname.startsWith('/reader');

  if (isReader) {
    return (
      <div className="h-full w-full bg-[var(--color-ink-sunken)] text-foreground">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-background text-foreground">
      <TopBar />
      <div className="relative flex min-h-0 flex-1">
        <Sidebar />
        <main className="relative min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex h-full w-full max-w-[1240px] flex-col px-[clamp(1.5rem,4vw,3.5rem)] pt-[clamp(1.75rem,4vh,3rem)] pb-20">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
