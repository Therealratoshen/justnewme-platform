'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function FundEscrowButton({ sessionId, amountCents }: { sessionId: string; amountCents: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fund() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/stripe/escrow', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message || 'Could not create payment.');
        setLoading(false);
        return;
      }
      // In demo mode the session goes straight to in_progress.
      // In real flow, redirect to Stripe Elements / Checkout using clientSecret.
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={fund}
        disabled={loading}
        className="px-4 py-2 rounded-md bg-brand-600 text-white font-medium hover:bg-brand-700 disabled:opacity-50"
      >
        {loading ? 'Creating…' : `Fund escrow ($${(amountCents / 100).toFixed(2)})`}
      </button>
      {error && <div className="text-xs text-red-700 mt-2">{error}</div>}
    </div>
  );
}
