'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Problem } from '@/app/lib/types';

interface Props {
  problems: Problem[];
  workerSkills: string[];
}

export default function ProblemFeed({ problems, workerSkills }: Props) {
  const router = useRouter();
  const [claiming, setClaiming] = useState<string | null>(null);
  const [intro, setIntro] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function claim(problemId: string) {
    setClaiming(problemId);
    setError(null);
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          problemId,
          message: intro[problemId] || "Hi! I'd love to help with this. Let me know if you want to chat first.",
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error?.message || 'Could not claim problem.');
        setClaiming(null);
        return;
      }
      router.push(`/workers/sessions/${json.data.session.id}`);
    } catch (e: any) {
      setError(e.message);
      setClaiming(null);
    }
  }

  if (problems.length === 0) {
    return (
      <p className="text-ink-600 text-sm mt-2">
        No matching problems right now. You&apos;ll get an email when one matches your skills.
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      {error && (
        <div className="p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>
      )}
      {problems.map((p) => {
        const matchPct = computeMatch(p, workerSkills);
        return (
          <div key={p.id} className="p-4 bg-white rounded-lg border border-ink-200">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{p.title}</h3>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-ink-100 text-ink-600">
                    {matchPct}% match
                  </span>
                  <UrgencyBadge urgency={p.urgency} />
                </div>
                <p className="text-sm text-ink-600 mt-1 line-clamp-2">{p.description}</p>
                <div className="text-xs text-ink-400 mt-2">
                  Budget: ${(p.budgetCents / 100).toFixed(0)} · Category: {p.category} · Posted {timeAgo(p.createdAt)}
                </div>
              </div>
              <div className="ml-4 flex flex-col gap-2 w-72">
                <textarea
                  rows={2}
                  placeholder="Optional intro message…"
                  className="text-sm border border-ink-200 rounded-md p-2"
                  value={intro[p.id] ?? ''}
                  onChange={(e) => setIntro((s) => ({ ...s, [p.id]: e.target.value }))}
                />
                <button
                  onClick={() => claim(p.id)}
                  disabled={claiming === p.id}
                  className="px-3 py-2 rounded-md bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
                >
                  {claiming === p.id ? 'Claiming…' : 'Claim →'}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function computeMatch(problem: Problem, skills: string[]): number {
  const overlap = problem.skillsNeeded.filter((s) => skills.includes(s)).length;
  const denom = Math.max(problem.skillsNeeded.length, 1);
  return Math.round((overlap / denom) * 100);
}

function UrgencyBadge({ urgency }: { urgency: Problem['urgency'] }) {
  const colors: Record<Problem['urgency'], string> = {
    low: 'bg-ink-100 text-ink-600',
    normal: 'bg-blue-50 text-blue-700',
    high: 'bg-orange-50 text-orange-700',
    urgent: 'bg-red-50 text-red-700',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${colors[urgency]}`}>{urgency}</span>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
