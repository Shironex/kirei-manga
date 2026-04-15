import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/', label: 'Library', end: true },
  { to: '/browse', label: 'Browse' },
  { to: '/settings', label: 'Settings' },
];

export function Sidebar() {
  return (
    <aside className="w-48 shrink-0 border-r border-border bg-muted">
      <nav className="flex flex-col p-2 gap-1">
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `rounded px-3 py-2 text-sm ${isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-border'}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
