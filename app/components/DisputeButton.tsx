'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DisputeButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (submitting || reason.length < 10) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/dispute`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message || 'Could not open dispute.');
        setSubmitting(false);
        return;
      }
      router.refresh();
    } catch (e: any) {
      setError(e.message);
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-ink-400 hover:text-red-700"
      >
        Something wrong? Open a dispute →
      </button>
    );
  }

  return (
    <div className="p-4 rounded-lg border border-red-200 bg-red-50">
      <h3 className="font-semibold text-red-900">Open a dispute</h3>
      <p className="text-xs text-red-800 mt-1">
        Money stays in escrow until JustNewMe support resolves this.
      </p>
      <textarea
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Explain what's wrong (min 10 chars)…"
        className="w-full mt-2 text-sm border border-red-200 rounded-md p-2 bg-white"
      />
      {error && <div className="text-xs text-red-700 mt-2">{error}</div>}
      <div className="flex gap-2 mt-2">
        <button
          onClick={submit}
          disabled={submitting || reason.length < 10}
          className="px-3 py-1.5 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
        >
          {submitting ? 'Opening…' : 'Open dispute'}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="px-3 py-1.5 rounded-md border border-ink-200 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
