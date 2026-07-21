// User-facing session page
// End user can: see session status, fund escrow, message the worker,
// approve the deliverable, or open a dispute.

import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/app/lib/auth';
import { Sessions, Problems, Workers, Messages } from '@/app/lib/data';
import SessionChat from '@/app/components/SessionChat';
import FundEscrowButton from '@/app/components/FundEscrowButton';
import ApproveWork from '@/app/components/ApproveWork';
import DisputeButton from '@/app/components/DisputeButton';

export const dynamic = 'force-dynamic';

export default async function UserSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect('/');

  const target = await Sessions.get(id);
  if (!target) notFound();
  if (target.userId !== session.user.id && session.user.role !== 'admin') {
    redirect('/');
  }

  const [msgs, problem, worker] = await Promise.all([
    Messages.listForSession(id),
    Problems.get(target.problemId),
    Workers.get(target.workerId),
  ]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex justify-between items-start">
        <div>
          <div className="text-xs text-ink-400 uppercase tracking-wider">Session {target.id}</div>
          <h1 className="text-2xl font-bold mt-1">{problem?.title ?? 'Session'}</h1>
          <div className="text-sm text-ink-600 mt-1">
            With {worker?.displayName} · ${(target.amountCents / 100).toFixed(0)} · Status: {target.status}
          </div>
        </div>
        <div className="text-right text-sm">
          <div>You pay: <strong>${(target.amountCents / 100).toFixed(2)}</strong></div>
          <div className="text-ink-400">Held in escrow until you approve</div>
        </div>
      </div>

      {target.status === 'pending_payment' && (
        <div className="mt-6 p-6 rounded-lg bg-yellow-50 border border-yellow-200">
          <strong>Fund the session</strong> to start the work. Money is held in
          escrow — released only when you approve the deliverable.
          <div className="mt-3">
            <FundEscrowButton sessionId={target.id} amountCents={target.amountCents} />
          </div>
        </div>
      )}

      <div className="mt-8 grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <h2 className="text-lg font-semibold mb-3">Conversation</h2>
          <SessionChat
            sessionId={target.id}
            initialMessages={msgs}
            viewerRole="user"
          />
        </div>
        <div>
          <h2 className="text-lg font-semibold mb-3">Original problem</h2>
          <div className="p-4 rounded-lg border border-ink-200 bg-white text-sm">
            <p>{problem?.description}</p>
          </div>

          {target.status === 'delivered' && (
            <div className="mt-6">
              <div className="p-4 rounded-lg border border-ink-200 bg-white">
                <h3 className="font-semibold">Deliverable</h3>
                <div className="text-sm mt-2 whitespace-pre-wrap">{target.deliverable?.content}</div>
              </div>
              <div className="mt-4">
                <ApproveWork sessionId={target.id} />
              </div>
              <div className="mt-3">
                <DisputeButton sessionId={target.id} />
              </div>
            </div>
          )}

          {target.status === 'approved' && target.outcome && (
            <div className="mt-6 p-4 rounded-lg bg-green-50 border border-green-200 text-sm">
              <strong>Session complete.</strong> You rated {target.outcome.rating}/5.
              {target.outcome.comment && <div className="mt-1 italic">&ldquo;{target.outcome.comment}&rdquo;</div>}
            </div>
          )}

          {target.status === 'disputed' && (
            <div className="mt-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm">
              <strong>Dispute open.</strong> JustNewMe support will reach out within 24 hours.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
