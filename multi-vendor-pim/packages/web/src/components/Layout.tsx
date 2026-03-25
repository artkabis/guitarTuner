import { NavLink, Outlet } from 'react-router-dom';

const nav = [
  { to: '/import', label: '1. Import' },
  { to: '/review', label: '2. Révision' },
  { to: '/publish', label: '3. Publication' },
  { to: '/settings', label: 'Paramètres' },
];

export function Layout() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-8">
        <span className="font-semibold text-gray-900 text-lg">PIM</span>
        <nav className="flex gap-1">
          {nav.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="flex-1 px-6 py-8 max-w-7xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  );
}
