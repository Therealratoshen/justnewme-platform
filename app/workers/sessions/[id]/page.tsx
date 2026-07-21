// Worker session detail page
// The workspace for an active session: messages, deliverable submission.

import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/app/lib/auth';
import { Sessions, Problems, Users, Messages } from '@/app/lib/data';
import SessionChat from '@/app/components/SessionChat';
import DeliverWork from '@/app/components/DeliverWork';

export const dynamic = 'force-dynamic';

export default async function WorkerSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.worker) redirect('/workers/dashboard');

  const target = await Sessions.get(id);
  if (!target) notFound();
  if (target.workerId !== session.worker.id) redirect('/workers/dashboard');

  const [msgs, problem, user] = await Promise.all([
    Messages.listForSession(id),
    Problems.get(target.problemId),
    Users.get(target.userId),
  ]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex justify-between items-start">
        <div>
          <div className="text-xs text-ink-400 uppercase tracking-wider">Session {target.id}</div>
          <h1 className="text-2xl font-bold mt-1">{problem?.title ?? 'Session'}</h1>
          <div className="text-sm text-ink-600 mt-1">
            With {user?.name ?? user?.email} · ${(target.amountCents / 100).toFixed(0)} · Status: {target.status}
          </div>
        </div>
        <div className="text-right text-sm">
          <div>Your earnings: <strong>${(target.workerEarningsCents / 100).toFixed(2)}</strong></div>
          <div className="text-ink-400">Platform fee: ${(target.platformFeeCents / 100).toFixed(2)}</div>
        </div>
      </div>

      <div className="mt-8 grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <h2 className="text-lg font-semibold mb-3">Messages</h2>
          <SessionChat
            sessionId={target.id}
            initialMessages={msgs}
            viewerRole="worker"
          />
        </div>
        <div>
          <h2 className="text-lg font-semibold mb-3">Original problem</h2>
          <div className="p-4 rounded-lg border border-ink-200 bg-white text-sm">
            <p>{problem?.description}</p>
            {problem?.aiAgentContext?.chatTranscript && (
              <details className="mt-3">
                <summary className="cursor-pointer text-brand-600 text-xs">
                  View AI agent chat transcript ({problem.aiAgentContext.chatTranscript.length} messages)
                </summary>
                <div className="mt-2 space-y-1 text-xs text-ink-600">
                  {problem.aiAgentContext.chatTranscript.map((m, i) => (
                    <div key={i}>
                      <strong>{m.role}:</strong> {m.content}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>

          {target.status === 'in_progress' && (
            <div className="mt-6">
              <DeliverWork sessionId={target.id} />
            </div>
          )}

          {target.status === 'delivered' && (
            <div className="mt-6 p-4 rounded-lg bg-blue-50 border border-blue-200 text-sm">
              <strong>Delivered.</strong> Awaiting user approval. Auto-release in 7 days.
            </div>
          )}

          {target.status === 'approved' && target.outcome && (
            <div className="mt-6 p-4 rounded-lg bg-green-50 border border-green-200 text-sm">
              <strong>Approved.</strong> {target.outcome.rating}/5 stars.
              {target.outcome.comment && <div className="mt-1 italic">&ldquo;{target.outcome.comment}&rdquo;</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
