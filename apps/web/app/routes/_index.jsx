import { Link } from '@remix-run/react';
import PublicLayout from '../components/PublicLayout';

export default function LandingPage() {
  return (
    <PublicLayout>
      <section className="mx-auto grid w-full max-w-[1500px] gap-8 px-3 pb-16 pt-12 sm:px-6 lg:grid-cols-12 lg:items-center xl:px-10 lg:pt-20">
        <div className="lg:col-span-7 xl:pr-6">
          <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-700">
            Built for modern job teams
          </span>
          <h1 className="mt-5 text-4xl font-black leading-tight tracking-tight text-slate-900 sm:text-5xl xl:text-6xl">
            From discovery to outreach,
            <span className="text-primary"> everything in one hiring workspace.</span>
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-relaxed text-slate-600 sm:text-lg">
            JobNest helps teams find opportunities, submit applications, and track communication from one clean,
            reliable dashboard.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/auth/sign-up"
              className="rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white shadow-soft transition hover:bg-emerald-700"
            >
              Get Started Free
            </Link>
            <Link
              to="/auth/sign-in"
              className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              Sign In
            </Link>
            <a href="#features" className="rounded-xl border border-transparent px-2 py-2 text-sm font-semibold text-slate-500 hover:text-slate-900">
              Jump to features
            </a>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-2xl font-extrabold text-slate-900">30s</p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500">Cached job queries</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-2xl font-extrabold text-slate-900">Redis</p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500">Queue + cache</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-2xl font-extrabold text-slate-900">SSR</p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500">Secure API calls</p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 rounded-3xl border border-slate-200 bg-white p-4 shadow-soft sm:p-6">
          <div className="rounded-2xl bg-slate-950 p-6 text-white">
            <p className="text-sm font-medium text-emerald-300">Live pipeline status</p>
            <h2 className="mt-2 text-2xl font-bold">Applications delivered with queue reliability.</h2>
            <ul className="mt-6 space-y-3 text-sm text-slate-200">
              <li className="flex gap-3">
                <span className="material-symbols-outlined text-emerald-300">task_alt</span>
                Server-side auth and routing with Remix loaders/actions
              </li>
              <li className="flex gap-3">
                <span className="material-symbols-outlined text-emerald-300">task_alt</span>
                Laravel Sanctum token sessions for user and admin flows
              </li>
              <li className="flex gap-3">
                <span className="material-symbols-outlined text-emerald-300">task_alt</span>
                Mail queue with CV attachment logging and delivery tracking
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto w-full max-w-[1500px] px-3 py-14 sm:px-6 xl:px-10">
        <div className="mb-10 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">Features</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Everything you need to operate faster</h2>
          </div>
          <Link to="/features" className="text-sm font-semibold text-primary hover:text-emerald-700">View all features</Link>
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {[
            ['Server-Only API', 'Laravel calls only from Remix loaders/actions.'],
            ['Smart Filtering', 'Search jobs by source, status, and location.'],
            ['Queue Emailing', 'Dispatch CV application emails through Redis queues.'],
            ['Admin Insights', 'Monitor users, sources, sync logs, and email logs.'],
          ].map(([title, copy]) => (
            <article key={title} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="inline-flex rounded-xl bg-emerald-50 p-2 text-primary">
                <span className="material-symbols-outlined">star</span>
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-900">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="pricing" className="mx-auto w-full max-w-[1500px] px-3 py-14 sm:px-6 xl:px-10">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-soft sm:p-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-primary">Pricing</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">Start free and scale with your team</h2>
              <p className="mt-3 text-slate-600">No complicated contracts. Launch, iterate, and expand as your pipeline grows.</p>
            </div>
            <Link to="/pricing" className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700">
              Explore plans
            </Link>
          </div>
        </div>
      </section>

      <section id="faq" className="mx-auto w-full max-w-[1500px] px-3 py-14 sm:px-6 xl:px-10">
        <div className="grid gap-6 md:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="text-lg font-bold text-slate-900">Does JobNest call the API from browser scripts?</h3>
            <p className="mt-2 text-sm text-slate-600">No. All backend calls are server-side in Remix loaders/actions only.</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="text-lg font-bold text-slate-900">Can I monitor delivery reliability?</h3>
            <p className="mt-2 text-sm text-slate-600">Yes. Email logs and queue processing are visible through admin pages.</p>
          </article>
        </div>
        <div className="mt-6">
          <Link to="/faq" className="text-sm font-semibold text-primary hover:text-emerald-700">Read full FAQ</Link>
        </div>
      </section>

      <section id="contact" className="mx-auto w-full max-w-[1500px] px-3 pb-20 pt-8 sm:px-6 xl:px-10">
        <div className="rounded-3xl bg-slate-950 p-8 text-white sm:p-10">
          <h2 className="text-3xl font-extrabold tracking-tight">Need help with onboarding?</h2>
          <p className="mt-3 max-w-2xl text-sm text-slate-300">
            We can help you configure your data flow, queue workers, and monitoring dashboards.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/contact" className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700">
              Contact us
            </Link>
            <Link to="/auth/sign-up" className="rounded-xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800">
              Get Started Free
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
