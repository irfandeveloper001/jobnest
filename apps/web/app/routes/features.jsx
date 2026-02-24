import PublicLayout from '../components/PublicLayout';

const featureGroups = [
  {
    title: 'Acquisition',
    items: ['Source aggregation from multiple providers', 'Search and server-side filtering', 'Status workflow for each role'],
  },
  {
    title: 'Application Workflow',
    items: ['Structured candidate profile collection', 'CV upload validation and storage', 'Queue-backed email dispatch'],
  },
  {
    title: 'Tracking & Insights',
    items: ['Email logs and sync logs', 'Inbox thread classification', 'Admin monitoring panels'],
  },
];

export default function FeaturesRoute() {
  return (
    <PublicLayout>
      <section className="mx-auto w-full max-w-[1500px] px-3 py-16 sm:px-6 xl:px-10">
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">Features</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-900">Built for speed, reliability, and control</h1>
        <p className="mt-4 max-w-3xl text-slate-600">
          JobNest combines server-rendered performance with dependable Laravel APIs so teams can focus on hiring outcomes.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {featureGroups.map((group) => (
            <article key={group.title} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="text-lg font-bold text-slate-900">{group.title}</h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-600">
                {group.items.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="material-symbols-outlined text-primary">check_circle</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </PublicLayout>
  );
}
