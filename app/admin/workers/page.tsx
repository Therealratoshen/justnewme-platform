// Admin: workers list
// Quality metrics + auto-detected flags. Suspend/ban from here.

import Link from 'next/link';
import { getSession } from '@/app/lib/auth';
import { Workers } from '@/app/lib/data';
import { detectQualityFlags } from '@/app/lib/quality';
import { redirect } from 'next/navigation';
import WorkerRow from '@/app/components/admin/WorkerRow';

export const dynamic = 'force-dynamic';

export default async function AdminWorkersPage() {
  const session = await getSession();
  if (!session || session.user.role !== 'admin') redirect('/admin');

  const all = await Workers.list();
  const withFlags = await Promise.all(
    all.map(async (w) => ({
      worker: w,
      flags: await detectQualityFlags(w.id),
    })),
  );

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <Link href="/admin" className="text-sm text-ink-600 hover:text-ink-900">← Admin</Link>
      <h1 className="text-3xl font-bold mt-2">Workers ({all.length})</h1>

      <div className="mt-6 bg-white rounded-lg border border-ink-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink-50 text-ink-600 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left p-3">Worker</th>
              <th className="text-left p-3">Skills</th>
              <th className="text-right p-3">Rating</th>
              <th className="text-right p-3">Completed</th>
              <th className="text-right p-3">Dispute %</th>
              <th className="text-right p-3">Earned</th>
              <th className="text-left p-3">Flags</th>
              <th className="text-left p-3">Status</th>
              <th className="text-right p-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-200">
            {withFlags.map(({ worker, flags }) => (
              <WorkerRow key={worker.id} worker={worker} flags={flags} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
