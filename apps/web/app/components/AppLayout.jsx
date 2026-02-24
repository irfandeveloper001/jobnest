import { Form, Link } from '@remix-run/react';

export default function AppLayout({ title, subtitle, role = 'user', children }) {
  const links = role === 'admin'
    ? [
      { to: '/admin/dashboard', label: 'Overview' },
      { to: '/admin/users', label: 'Users' },
      { to: '/admin/job-sources', label: 'Job Sources' },
      { to: '/admin/email-logs', label: 'Email Logs' },
    ]
    : [
      { to: '/app/dashboard', label: 'Dashboard' },
      { to: '/app/jobs', label: 'Jobs' },
      { to: '/app/applications', label: 'Applications' },
      { to: '/app/interviews', label: 'Interviews' },
      { to: '/app/analytics', label: 'Analytics' },
      { to: '/app/settings', label: 'Settings' },
    ];

  return (
    <div className="min-h-screen bg-background-light px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="glass-nav rounded-2xl p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">dashboard</span>
                <Link to="/" className="text-lg font-extrabold tracking-tight text-slate-900">JobNest</Link>
              </div>
              <h1 className="mt-2 text-2xl font-bold text-slate-900">{title}</h1>
              {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link to="/" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Public Site
              </Link>
              {role === 'admin' ? (
                <Link to="/app/dashboard" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  User Area
                </Link>
              ) : (
                <Link to="/admin/dashboard" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Admin Area
                </Link>
              )}
              <Form method="post" action="/logout">
                <button type="submit" className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700">
                  Logout
                </button>
              </Form>
            </div>
          </div>

          <nav className="mt-4 flex flex-wrap gap-2">
            {links.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </header>

        {children}
      </div>
    </div>
  );
}
