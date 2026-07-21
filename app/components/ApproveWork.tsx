'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ApproveWork({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rating, comment: comment || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message || 'Could not approve.');
        setSubmitting(false);
        return;
      }
      router.refresh();
    } catch (e: any) {
      setError(e.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="p-4 rounded-lg border border-ink-200 bg-white">
      <h3 className="font-semibold">Approve & release payment</h3>

      <div className="mt-3">
        <label className="text-xs font-medium text-ink-600">Rate the work</label>
        <div className="flex gap-1 mt-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setRating(n)}
              className={`text-2xl ${rating >= n ? 'text-yellow-400' : 'text-ink-200'}`}
            >
              ★
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <label className="text-xs font-medium text-ink-600">Comment (optional)</label>
        <textarea
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="w-full mt-1 text-sm border border-ink-200 rounded-md p-2"
          placeholder="What did the worker do well?"
        />
      </div>

      {error && <div className="text-xs text-red-700 mt-2">{error}</div>}

      <button
        onClick={approve}
        disabled={submitting}
        className="w-full mt-3 px-3 py-2 rounded-md bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
      >
        {submitting ? 'Approving…' : 'Approve & release payment'}
      </button>
    </div>
  );
}
