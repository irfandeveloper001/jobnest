import PublicLayout from '../components/PublicLayout';

const faqs = [
  {
    q: 'How does Remix communicate with Laravel?',
    a: 'Only through server-side loaders and actions. Browser scripts never call Laravel directly.',
  },
  {
    q: 'Do application emails run synchronously?',
    a: 'No. They are queued through Redis for resilient background delivery.',
  },
  {
    q: 'Can admins control job source syncing?',
    a: 'Yes. Admin routes expose job-source toggles and interval settings.',
  },
  {
    q: 'Is inbox monitoring available?',
    a: 'Yes. Inbox thread routes and optional IMAP sync command are included.',
  },
];

export default function FaqRoute() {
  return (
    <PublicLayout>
      <section className="mx-auto w-full max-w-[1200px] px-3 py-16 sm:px-6 xl:px-10">
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">FAQ</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-900">Answers for common setup questions</h1>

        <div className="mt-10 space-y-4">
          {faqs.map((item) => (
            <article key={item.q} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="text-lg font-bold text-slate-900">{item.q}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.a}</p>
            </article>
          ))}
        </div>
      </section>
    </PublicLayout>
  );
}
