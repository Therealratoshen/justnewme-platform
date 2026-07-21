'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Session } from '@/app/lib/types';

interface Props {
  session: Session;
  userName: string;
  workerName: string;
}

export default function DisputeCard({ session, userName, workerName }: Props) {
  const router = useRouter();
  const [resolving, setResolving] = useState(false);
  const [internalNote, setInternalNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function resolve(resolution: 'refund_user' | 'release_worker' | 'split') {
    if (resolving) return;
    if (!confirm(`Confirm resolution: ${resolution.replace('_', ' ')}?`)) return;
    setResolving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/disputes/${session.id}/resolve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resolution, internalNote: internalNote || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message || 'Could not resolve.');
        setResolving(false);
        return;
      }
      router.refresh();
    } catch (e: any) {
      setError(e.message);
      setResolving(false);
    }
  }

  const ageHours = session.dispute
    ? Math.floor((Date.now() - new Date(session.dispute.openedAt).getTime()) / (60 * 60 * 1000))
    : 0;
  const isStale = ageHours > 24;

  return (
    <div className={`p-4 bg-white rounded-lg border ${isStale ? 'border-red-300' : 'border-ink-200'}`}>
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium">{session.id}</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700">dispute</span>
            {isStale && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800">
                {ageHours}h old
              </span>
            )}
          </div>
          <div className="text-sm text-ink-600 mt-1">
            ${(session.amountCents / 100).toFixed(2)} · {userName} vs. {workerName} · Opened by {session.dispute?.openedBy}
          </div>
          <div className="text-sm mt-2 p-2 bg-ink-50 rounded">
            <strong>Reason:</strong> {session.dispute?.reason}
          </div>
        </div>
      </div>

      {session.deliverable && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-ink-600">View deliverable</summary>
          <div className="mt-2 p-2 bg-ink-50 rounded text-sm whitespace-pre-wrap">
            {session.deliverable.content}
          </div>
        </details>
      )}

      <textarea
        rows={2}
        value={internalNote}
        onChange={(e) => setInternalNote(e.target.value)}
        placeholder="Internal note (audit log only, not shown to user/worker)…"
        className="w-full mt-3 text-sm border border-ink-200 rounded-md p-2"
      />

      {error && <div className="text-xs text-red-700 mt-2">{error}</div>}

      <div className="flex gap-2 mt-3">
        <button
          onClick={() => resolve('refund_user')}
          disabled={resolving}
          className="px-3 py-1.5 rounded-md bg-ink-100 text-sm font-medium hover:bg-ink-200 disabled:opacity-50"
        >
          Refund user
        </button>
        <button
          onClick={() => resolve('release_worker')}
          disabled={resolving}
          className="px-3 py-1.5 rounded-md bg-green-50 text-green-800 text-sm font-medium hover:bg-green-100 disabled:opacity-50"
        >
          Release to worker
        </button>
        <button
          onClick={() => resolve('split')}
          disabled={resolving}
          className="px-3 py-1.5 rounded-md bg-blue-50 text-blue-800 text-sm font-medium hover:bg-blue-100 disabled:opacity-50"
        >
          Split (manual)
        </button>
      </div>
    </div>
  );
}
