// Unit tests — the QA / quality metrics layer
// Verifies that worker reputation is computed correctly from session history.

import { describe, it, expect, beforeEach } from 'vitest';
import { computeWorkerMetrics, detectQualityFlags } from '../../app/lib/quality';
import { Users, Workers, Problems, Sessions, Events } from '../../app/lib/data';

// Each test creates a fresh worker and session history to keep the math
// deterministic. Vitest runs these in parallel by default, so we make
// sure each test uses unique IDs (randomIds already do that).

async function setupWorker() {
  const u = await Users.create({
    email: `w-${Math.random().toString(36).slice(2)}@example.com`,
    name: 'W', role: 'worker',
  });
  return await Workers.create({
    userId: u.id, displayName: 'W', headline: '', bio: '',
    skills: ['x'], categories: ['strategy'],
    hourlyRate: 100, currency: 'USD', status: 'active',
  });
}

async function setupCompletedSession(workerId: string, rating?: number) {
  const u = await Users.create({
    email: `u-${Math.random().toString(36).slice(2)}@example.com`,
    name: 'U', role: 'end_user',
  });
  const p = await Problems.create({
    postedByUserId: u.id, title: 'T', description: 'A description with enough length',
    category: 'strategy', skillsNeeded: ['x'], budgetCents: 10_000, urgency: 'normal',
  });
  const s = await Sessions.create({
    problemId: p.id, userId: u.id, workerId,
    amountCents: 10_000, platformFeeCents: 1_500, workerEarningsCents: 8_500,
    currency: 'USD', status: 'approved',
  });
  if (rating) {
    await Sessions.update(s.id, {
      outcome: { rating: rating as any, ratedAt: new Date().toISOString() },
    });
  }
  return s;
}

describe('computeWorkerMetrics', () => {
  it('returns zeros for a worker with no history', async () => {
    const w = await setupWorker();
    const m = await computeWorkerMetrics(w.id);
    expect(m.rating).toBe(0);
    expect(m.completedSessions).toBe(0);
    expect(m.disputeRate).toBe(0);
  });

  it('averages ratings across sessions', async () => {
    const w = await setupWorker();
    await setupCompletedSession(w.id, 5);
    await setupCompletedSession(w.id, 3);
    await setupCompletedSession(w.id, 4);
    const m = await computeWorkerMetrics(w.id);
    expect(m.rating).toBeCloseTo(4.0, 1);
    expect(m.ratingCount).toBe(3);
    expect(m.completedSessions).toBe(3);
  });

  it('computes dispute rate from session statuses', async () => {
    const w = await setupWorker();
    await setupCompletedSession(w.id); // approved
    await setupCompletedSession(w.id); // approved
    const u = await Users.create({ email: 'u-x@example.com', name: 'X', role: 'end_user' });
    const p = await Problems.create({
      postedByUserId: u.id, title: 'T', description: 'A description with enough length',
      category: 'strategy', skillsNeeded: ['x'], budgetCents: 5_000, urgency: 'normal',
    });
    await Sessions.create({
      problemId: p.id, userId: u.id, workerId: w.id,
      amountCents: 5_000, platformFeeCents: 750, workerEarningsCents: 4_250,
      currency: 'USD', status: 'disputed',
    });
    const m = await computeWorkerMetrics(w.id);
    // 1 of 3 disputed = 33%
    expect(m.disputeRate).toBeCloseTo(0.33, 1);
  });

  it('sums worker earnings from approved sessions', async () => {
    const w = await setupWorker();
    await setupCompletedSession(w.id); // 8500 earnings
    await setupCompletedSession(w.id); // 8500 earnings
    const m = await computeWorkerMetrics(w.id);
    expect(m.totalEarningsCents).toBe(17_000);
  });
});

describe('detectQualityFlags', () => {
  it('flags high dispute rate', async () => {
    const w = await setupWorker();
    // 3 approved + 1 disputed = 25% dispute rate
    await setupCompletedSession(w.id);
    await setupCompletedSession(w.id);
    await setupCompletedSession(w.id);
    const u = await Users.create({ email: 'flag@example.com', name: 'F', role: 'end_user' });
    const p = await Problems.create({
      postedByUserId: u.id, title: 'T', description: 'A description with enough length',
      category: 'strategy', skillsNeeded: ['x'], budgetCents: 5_000, urgency: 'normal',
    });
    await Sessions.create({
      problemId: p.id, userId: u.id, workerId: w.id,
      amountCents: 5_000, platformFeeCents: 750, workerEarningsCents: 4_250,
      currency: 'USD', status: 'disputed',
    });
    await Workers.update(w.id, { disputeRate: 0.25, completedSessions: 3 });
    const flags = await detectQualityFlags(w.id);
    expect(flags.some((f) => f.reason.includes('Dispute rate'))).toBe(true);
    expect(flags.find((f) => f.reason.includes('Dispute rate'))?.severity).toBe('high');
  });

  it('flags low rating with enough samples', async () => {
    const w = await setupWorker();
    await Workers.update(w.id, { rating: 3.0, ratingCount: 5 });
    const flags = await detectQualityFlags(w.id);
    expect(flags.some((f) => f.reason.includes('Rating'))).toBe(true);
  });

  it('does not flag with too few samples', async () => {
    const w = await setupWorker();
    await Workers.update(w.id, { rating: 2.0, ratingCount: 1, disputeRate: 0.5, completedSessions: 1 });
    const flags = await detectQualityFlags(w.id);
    expect(flags.find((f) => f.reason.includes('Dispute rate'))).toBeUndefined();
  });
});
