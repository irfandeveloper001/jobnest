import { Link } from '@remix-run/react';

const NAV_LINKS = [
  { to: '/features', label: 'Features' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/faq', label: 'FAQ' },
  { to: '/contact', label: 'Contact' },
];

export default function PublicLayout({ children }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-background-light to-emerald-50/30">
      <header className="sticky top-0 z-40 px-3 pt-4 sm:px-6 xl:px-10">
        <div className="mx-auto w-full max-w-[1500px]">
          <nav className="glass-nav flex items-center justify-between rounded-2xl px-4 py-3 sm:px-6">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">work</span>
              <Link to="/" className="text-lg font-extrabold tracking-tight text-slate-900">
                JobNest
              </Link>
            </div>

            <div className="hidden items-center gap-6 md:flex">
              {NAV_LINKS.map((link) => (
                <Link key={link.to} to={link.to} className="text-sm font-medium text-slate-600 transition hover:text-slate-900">
                  {link.label}
                </Link>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Link
                to="/auth/sign-in"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Sign In
              </Link>
              <Link
                to="/auth/sign-up"
                className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                Get Started Free
              </Link>
            </div>
          </nav>
        </div>
      </header>

      <main>{children}</main>

      <footer className="mt-20 border-t border-slate-200/80 bg-white/70 px-3 py-12 sm:px-6 xl:px-10">
        <div className="mx-auto grid w-full max-w-[1500px] gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">work</span>
              <span className="text-lg font-extrabold tracking-tight text-slate-900">JobNest</span>
            </div>
            <p className="mt-3 max-w-lg text-sm text-slate-600">
              All hiring workflows in one place: discover roles, manage outreach, submit tailored applications, and
              track replies.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Explore</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li><Link to="/features" className="hover:text-slate-900">Features</Link></li>
              <li><Link to="/pricing" className="hover:text-slate-900">Pricing</Link></li>
              <li><Link to="/faq" className="hover:text-slate-900">FAQ</Link></li>
              <li><Link to="/contact" className="hover:text-slate-900">Contact</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Access</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li><Link to="/auth/sign-in" className="hover:text-slate-900">Sign In</Link></li>
              <li><Link to="/auth/sign-up" className="hover:text-slate-900">Create Account</Link></li>
              <li><Link to="/app/dashboard" className="hover:text-slate-900">User Dashboard</Link></li>
              <li><Link to="/admin/dashboard" className="hover:text-slate-900">Admin Dashboard</Link></li>
            </ul>
          </div>
        </div>
        <div className="mx-auto mt-8 w-full max-w-[1500px] border-t border-slate-200 pt-6 text-sm text-slate-500">
          © {new Date().getFullYear()} JobNest. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
