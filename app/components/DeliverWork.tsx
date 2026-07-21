'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  sessionId: string;
}

export default function DeliverWork({ sessionId }: Props) {
  const router = useRouter();
  const [type, setType] = useState<'document' | 'link' | 'message' | 'call_summary'>('document');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/deliver`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type, content }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message || 'Could not submit deliverable.');
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
      <h3 className="font-semibold">Submit your work</h3>
      <p className="text-xs text-ink-600 mt-1">
        Once submitted, the user has 7 days to approve or dispute.
        Auto-release happens if they don&apos;t respond.
      </p>

      <div className="mt-3 space-y-2">
        <label className="text-xs font-medium text-ink-600">Deliverable type</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as any)}
          className="w-full text-sm border border-ink-200 rounded-md p-2"
        >
          <option value="document">Document / write-up</option>
          <option value="link">Link to work</option>
          <option value="call_summary">Call summary</option>
          <option value="message">Just a message</option>
        </select>

        <label className="text-xs font-medium text-ink-600 block mt-3">Content</label>
        <textarea
          rows={6}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Paste your deliverable, link, or summary…"
          className="w-full text-sm border border-ink-200 rounded-md p-2"
        />

        {error && <div className="text-xs text-red-700">{error}</div>}

        <button
          onClick={submit}
          disabled={submitting || !content.trim()}
          className="w-full mt-2 px-3 py-2 rounded-md bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'Submit deliverable'}
        </button>
      </div>
    </div>
  );
}
