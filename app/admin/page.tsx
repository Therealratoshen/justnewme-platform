// Admin dashboard
// Top-level health view: GMV, active sessions, open disputes, flag count.

import Link from 'next/link';
import { getSession } from '@/app/lib/auth';
import { Sessions, Problems, Workers, Users } from '@/app/lib/data';
import { detectQualityFlags } from '@/app/lib/quality';
import { seedDevData } from '@/app/lib/data';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  await seedDevData();
  const session = await getSession();
  if (!session) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20">
        <h1 className="text-3xl font-bold">Admin</h1>
        <p className="mt-4 text-ink-600">Sign in as an admin to see the dashboard.</p>
        <form action="/api/auth/demo-login" method="POST" className="mt-6">
          <input type="hidden" name="role" value="admin" />
          <button className="px-3 py-2 rounded-md bg-brand-600 text-white text-sm">
            Demo login as admin
          </button>
        </form>
      </div>
    );
  }
  if (session.user.role !== 'admin') {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20">
        <h1 className="text-3xl font-bold">Admin</h1>
        <p className="mt-4 text-ink-600">This account is not an admin.</p>
      </div>
    );
  }

  const [allSessions, allProblems, allWorkers, allUsers] = await Promise.all([
    Sessions.list(),
    Problems.list(),
    Workers.list(),
    Users.list(),
  ]);

  const openDisputes = allSessions.filter((s) => s.status === 'disputed');
  const activeSessions = allSessions.filter((s) => ['in_progress', 'delivered', 'pending_payment'].includes(s.status));
  const completedSessions = allSessions.filter((s) => s.status === 'approved');
  const gmvCents = completedSessions.reduce((sum, s) => sum + s.amountCents, 0);
  const platformRevenueCents = completedSessions.reduce((sum, s) => sum + s.platformFeeCents, 0);

  // Aggregate quality flags
  const allFlags = (await Promise.all(allWorkers.map((w) => detectQualityFlags(w.id)))).flat();
  const flagCounts = {
    high: allFlags.filter((f) => f.severity === 'high').length,
    medium: allFlags.filter((f) => f.severity === 'medium').length,
    low: allFlags.filter((f) => f.severity === 'low').length,
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold">Admin</h1>
      <p className="text-sm text-ink-600 mt-1">JustNewMe operations dashboard</p>

      <div className="mt-8 grid md:grid-cols-4 gap-4">
        <Stat label="GMV (lifetime)" value={`$${(gmvCents / 100).toFixed(0)}`} />
        <Stat label="Platform revenue" value={`$${(platformRevenueCents / 100).toFixed(0)}`} />
        <Stat label="Active sessions" value={activeSessions.length} />
        <Stat label="Open disputes" value={openDisputes.length} accent={openDisputes.length > 0 ? 'red' : 'default'} />
      </div>

      <div className="mt-8 grid md:grid-cols-2 gap-4">
        <Link href="/admin/disputes" className="block p-6 rounded-lg border border-ink-200 bg-white hover:border-brand-500">
          <h2 className="font-semibold">Disputes queue</h2>
          <p className="text-3xl font-bold mt-2">{openDisputes.length}</p>
          <p className="text-xs text-ink-400 mt-1">open · resolve within 48 hours</p>
        </Link>
        <Link href="/admin/workers" className="block p-6 rounded-lg border border-ink-200 bg-white hover:border-brand-500">
          <h2 className="font-semibold">Worker quality</h2>
          <p className="text-3xl font-bold mt-2">{allWorkers.length}</p>
          <p className="text-xs text-ink-400 mt-1">
            {flagCounts.high} high · {flagCounts.medium} medium · {flagCounts.low} low flags
          </p>
        </Link>
      </div>

      <div className="mt-8 grid md:grid-cols-4 gap-4">
        <Stat label="Total users" value={allUsers.length} />
        <Stat label="Total workers" value={allWorkers.length} />
        <Stat label="Total problems" value={allProblems.length} />
        <Stat label="Total sessions" value={allSessions.length} />
      </div>
    </div>
  );
}

function Stat({ label, value, accent = 'default' }: { label: string; value: number | string; accent?: 'default' | 'red' }) {
  return (
    <div className="p-4 bg-white rounded-lg border border-ink-200">
      <div className={`text-2xl font-semibold ${accent === 'red' ? 'text-red-700' : ''}`}>{value}</div>
      <div className="text-xs text-ink-600 mt-1">{label}</div>
    </div>
  );
}
