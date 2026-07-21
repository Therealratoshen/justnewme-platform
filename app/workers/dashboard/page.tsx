// Worker dashboard
// Shows the worker's profile summary, available problems to claim,
// active sessions, and earnings.

import Link from 'next/link';
import { getSession } from '@/app/lib/auth';
import { Workers, Problems, Sessions } from '@/app/lib/data';
import { seedDevData } from '@/app/lib/data';
import ProblemFeed from '@/app/components/ProblemFeed';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function WorkerDashboard() {
  await seedDevData();
  const session = await getSession();
  if (!session?.worker) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20">
        <h1 className="text-3xl font-bold">Worker dashboard</h1>
        <p className="mt-4 text-ink-600">
          Sign in as a worker to see your dashboard. For the demo,
          <a href="/workers/demo-login" className="text-brand-600 underline ml-1">
            use the demo login as Filbert
          </a>.
        </p>
      </div>
    );
  }
  const worker = session.worker;
  const available = await Problems.listAvailableForWorker(worker.id);
  const active = await Sessions.list({ workerId: worker.id, status: 'in_progress' });
  const delivered = await Sessions.list({ workerId: worker.id, status: 'delivered' });
  const completed = await Sessions.list({ workerId: worker.id, status: 'approved' });

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">{worker.displayName}</h1>
          <p className="text-ink-600 mt-1">{worker.headline}</p>
        </div>
        <div className="text-right text-sm text-ink-600">
          <div>⭐ {worker.rating.toFixed(1)} · {worker.ratingCount} ratings</div>
          <div>${(worker.totalEarningsCents / 100).toFixed(0)} earned</div>
        </div>
      </div>

      {!worker.stripeOnboardingComplete && (
        <div className="mt-6 p-4 rounded-lg bg-yellow-50 border border-yellow-200">
          <strong>Setup incomplete.</strong> You can browse problems, but
          you can&apos;t claim them until you finish onboarding.
          <a href="/workers/onboarding" className="ml-2 text-brand-700 underline">
            Complete setup →
          </a>
        </div>
      )}

      {worker.stripeOnboardingComplete && (
        <div className="mt-6 p-4 rounded-lg bg-green-50 border border-green-200 text-sm">
          ✅ Onboarding complete. You can claim any matching problem below.
        </div>
      )}

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Available problems ({available.length})</h2>
        <ProblemFeed problems={available} workerSkills={worker.skills} />
      </section>

      <section className="mt-10 grid md:grid-cols-3 gap-4">
        <Stat label="Active sessions" value={active.length} />
        <Stat label="Awaiting approval" value={delivered.length} />
        <Stat label="Completed" value={completed.length} />
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Active sessions</h2>
        {active.length === 0 ? (
          <p className="text-ink-600 text-sm mt-2">No active sessions.</p>
        ) : (
          <ul className="mt-3 divide-y divide-ink-200 bg-white rounded-lg border border-ink-200">
            {active.map((s) => (
              <li key={s.id} className="p-4 flex justify-between items-center">
                <div>
                  <Link href={`/workers/sessions/${s.id}`} className="font-medium text-brand-700">
                    {s.id}
                  </Link>
                  <div className="text-xs text-ink-600">${(s.amountCents / 100).toFixed(0)} · in progress</div>
                </div>
                <Link href={`/workers/sessions/${s.id}`} className="text-sm text-ink-600 hover:text-ink-900">
                  Open →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Awaiting user approval ({delivered.length})</h2>
        {delivered.length === 0 ? (
          <p className="text-ink-600 text-sm mt-2">Nothing waiting for approval.</p>
        ) : (
          <ul className="mt-3 divide-y divide-ink-200 bg-white rounded-lg border border-ink-200">
            {delivered.map((s) => (
              <li key={s.id} className="p-4">
                <Link href={`/workers/sessions/${s.id}`} className="font-medium text-brand-700">
                  {s.id}
                </Link>
                <div className="text-xs text-ink-600">
                  ${(s.amountCents / 100).toFixed(0)} · delivered {s.deliveredAt ? new Date(s.deliveredAt).toLocaleDateString() : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="p-4 bg-white rounded-lg border border-ink-200">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-ink-600 mt-1">{label}</div>
    </div>
  );
}
