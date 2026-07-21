// Admin: disputes queue
// Open disputes, sorted by age. Each shows who, what, when.

import Link from 'next/link';
import { getSession } from '@/app/lib/auth';
import { Sessions, Users, Workers } from '@/app/lib/data';
import { redirect } from 'next/navigation';
import DisputeCard from '@/app/components/admin/DisputeCard';

export const dynamic = 'force-dynamic';

export default async function DisputesPage() {
  const session = await getSession();
  if (!session || session.user.role !== 'admin') redirect('/admin');

  const all = await Sessions.list();
  const open = all
    .filter((s) => s.status === 'disputed')
    .sort((a, b) => (b.dispute?.openedAt ?? '').localeCompare(a.dispute?.openedAt ?? ''));

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <Link href="/admin" className="text-sm text-ink-600 hover:text-ink-900">← Admin</Link>
      <h1 className="text-3xl font-bold mt-2">Disputes queue</h1>
      <p className="text-sm text-ink-600 mt-1">{open.length} open</p>

      <div className="mt-6 space-y-3">
        {open.length === 0 ? (
          <p className="text-ink-400 italic">No open disputes. </p>
        ) : (
          await Promise.all(
            open.map(async (s) => {
              const [user, worker] = await Promise.all([
                Users.get(s.userId),
                Workers.get(s.workerId),
              ]);
              return (
                <DisputeCard
                  key={s.id}
                  session={s}
                  userName={user?.name ?? user?.email ?? '?'}
                  workerName={worker?.displayName ?? '?'}
                />
              );
            }),
          )
        )}
      </div>
    </div>
  );
}
