import { Link } from '@remix-run/react';
import PublicLayout from '../components/PublicLayout';

const plans = [
  {
    name: 'Starter',
    price: '$0',
    copy: 'For solo users validating workflow setup.',
    features: ['Job discovery + filtering', 'Application submission', 'Basic dashboard metrics'],
  },
  {
    name: 'Team',
    price: '$29',
    copy: 'For small teams coordinating hiring campaigns.',
    features: ['Everything in Starter', 'Admin console + logs', 'Priority support'],
  },
  {
    name: 'Scale',
    price: 'Custom',
    copy: 'For organizations with higher throughput and governance needs.',
    features: ['Dedicated onboarding', 'Custom automation strategy', 'Service-level support'],
  },
];

export default function PricingRoute() {
  return (
    <PublicLayout>
      <section className="mx-auto w-full max-w-[1500px] px-3 py-16 sm:px-6 xl:px-10">
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">Pricing</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-900">Simple plans for every stage</h1>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {plans.map((plan) => (
            <article key={plan.name} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-extrabold text-slate-900">{plan.name}</h2>
              <p className="mt-2 text-3xl font-black text-slate-900">{plan.price}</p>
              <p className="mt-2 text-sm text-slate-600">{plan.copy}</p>
              <ul className="mt-5 space-y-2 text-sm text-slate-600">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <span className="material-symbols-outlined text-primary">done</span>
                    {feature}
                  </li>
                ))}
              </ul>
              <Link to="/auth/sign-up" className="mt-6 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                Get Started Free
              </Link>
            </article>
          ))}
        </div>
      </section>
    </PublicLayout>
  );
}
