'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Worker, WorkerStatus } from '@/app/lib/types';
import type { QualityFlag } from '@/app/lib/quality';

interface Props {
  worker: Worker;
  flags: QualityFlag[];
}

export default function WorkerRow({ worker, flags }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function setStatus(status: WorkerStatus) {
    if (busy) return;
    if (!confirm(`Set ${worker.displayName} to ${status}?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/workers/${worker.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const j = await res.json();
        alert(j.error?.message || 'Failed');
      } else {
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const statusColors: Record<WorkerStatus, string> = {
    pending_verification: 'bg-yellow-50 text-yellow-700',
    active: 'bg-green-50 text-green-700',
    suspended: 'bg-orange-50 text-orange-700',
    banned: 'bg-red-50 text-red-700',
  };

  return (
    <tr>
      <td className="p-3">
        <div className="font-medium">{worker.displayName}</div>
        <div className="text-xs text-ink-400">{worker.headline}</div>
      </td>
      <td className="p-3 text-xs">
        {worker.skills.slice(0, 3).join(', ')}
        {worker.skills.length > 3 && ` +${worker.skills.length - 3}`}
      </td>
      <td className="p-3 text-right">
        {worker.ratingCount > 0 ? `${worker.rating.toFixed(1)} (${worker.ratingCount})` : '—'}
      </td>
      <td className="p-3 text-right">{worker.completedSessions}</td>
      <td className="p-3 text-right">{(worker.disputeRate * 100).toFixed(0)}%</td>
      <td className="p-3 text-right">${(worker.totalEarningsCents / 100).toFixed(0)}</td>
      <td className="p-3">
        {flags.length === 0 ? (
          <span className="text-xs text-ink-400">none</span>
        ) : (
          <div className="space-y-1">
            {flags.map((f, i) => (
              <div
                key={i}
                className={`text-xs px-2 py-0.5 rounded ${
                  f.severity === 'high'
                    ? 'bg-red-50 text-red-700'
                    : f.severity === 'medium'
                      ? 'bg-orange-50 text-orange-700'
                      : 'bg-yellow-50 text-yellow-700'
                }`}
                title={f.reason}
              >
                {f.reason}
              </div>
            ))}
          </div>
        )}
      </td>
      <td className="p-3">
        <span className={`text-xs px-2 py-0.5 rounded ${statusColors[worker.status]}`}>
          {worker.status}
        </span>
      </td>
      <td className="p-3 text-right">
        {worker.status === 'active' ? (
          <button onClick={() => setStatus('suspended')} disabled={busy} className="text-xs text-orange-700 hover:underline mr-2">
            Suspend
          </button>
        ) : worker.status === 'suspended' ? (
          <button onClick={() => setStatus('active')} disabled={busy} className="text-xs text-green-700 hover:underline mr-2">
            Activate
          </button>
        ) : null}
        {worker.status !== 'banned' && (
          <button onClick={() => setStatus('banned')} disabled={busy} className="text-xs text-red-700 hover:underline">
            Ban
          </button>
        )}
      </td>
    </tr>
  );
}
