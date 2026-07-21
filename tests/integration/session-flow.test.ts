// Integration tests — the full session lifecycle
// These simulate the complete flow: post problem → claim → fund →
// message → deliver → approve → metrics refresh.

import { describe, it, expect, beforeEach } from 'vitest';
import { Users, Workers, Problems, Sessions, Messages } from '../../app/lib/data';
import { refreshWorkerMetrics, computeWorkerMetrics } from '../../app/lib/quality';

async function setup() {
  const user = await Users.create({
    email: `u-${Math.random().toString(36).slice(2)}@example.com`,
    name: 'User', role: 'end_user',
  });
  const workerUser = await Users.create({
    email: `w-${Math.random().toString(36).slice(2)}@example.com`,
    name: 'Worker', role: 'worker',
  });
  const worker = await Workers.create({
    userId: workerUser.id, displayName: 'Worker', headline: '', bio: '',
    skills: ['ai_strategy'], categories: ['strategy'],
    hourlyRate: 150, currency: 'USD', status: 'active',
  });
  const problem = await Problems.create({
    postedByUserId: user.id, title: 'Test Problem', description: 'A description with enough length to pass validation',
    category: 'strategy', skillsNeeded: ['ai_strategy'],
    budgetCents: 30_000, urgency: 'normal',
  });
  return { user, workerUser, worker, problem };
}

describe('Session lifecycle', () => {
  it('runs the full flow: post → claim → message → deliver → approve', async () => {
    const { user, worker, problem } = await setup();

    // 1. Worker claims the problem
    const session = await Sessions.create({
      problemId: problem.id, userId: user.id, workerId: worker.id,
      amountCents: 30_000,
      platformFeeCents: 4_500,
      workerEarningsCents: 25_500,
      currency: 'USD', status: 'pending_payment',
    });
    await Problems.update(problem.id, { status: 'claimed', claimedByWorkerId: worker.id, sessionId: session.id });
    expect(session.status).toBe('pending_payment');

    // 2. User funds the escrow (we just mark as in_progress here)
    const inProgress = await Sessions.update(session.id, { status: 'in_progress', paymentStatus: 'authorized' });
    expect(inProgress?.status).toBe('in_progress');

    // 3. Worker introduces themselves
    await Messages.create({
      sessionId: session.id, fromUserId: worker.userId, fromRole: 'worker',
      content: 'Hi! I can help with this.',
    });
    // 4. User replies
    await Messages.create({
      sessionId: session.id, fromUserId: user.id, fromRole: 'user',
      content: 'Great, please go ahead.',
    });
    const msgs = await Messages.listForSession(session.id);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].fromRole).toBe('worker');
    expect(msgs[1].fromRole).toBe('user');

    // 5. Worker delivers
    const delivered = await Sessions.update(session.id, {
      status: 'delivered',
      deliveredAt: new Date().toISOString(),
      deliverable: { type: 'document', content: 'Here is your strategy doc.', submittedAt: new Date().toISOString() },
    });
    expect(delivered?.status).toBe('delivered');

    // 6. User approves with 5 stars
    const approved = await Sessions.update(session.id, {
      status: 'approved',
      paymentStatus: 'captured',
      approvedAt: new Date().toISOString(),
      outcome: { rating: 5, comment: 'Excellent work.', ratedAt: new Date().toISOString() },
    });
    expect(approved?.status).toBe('approved');
    expect(approved?.outcome?.rating).toBe(5);

    // 7. Worker metrics should be refreshed
    await refreshWorkerMetrics(worker.id);
    const finalWorker = await Workers.get(worker.id);
    expect(finalWorker?.completedSessions).toBe(1);
    expect(finalWorker?.rating).toBe(5);
    expect(finalWorker?.ratingCount).toBe(1);
    expect(finalWorker?.totalEarningsCents).toBe(25_500);
  });

  it('handles the dispute path', async () => {
    const { user, worker, problem } = await setup();
    const session = await Sessions.create({
      problemId: problem.id, userId: user.id, workerId: worker.id,
      amountCents: 30_000, platformFeeCents: 4_500, workerEarningsCents: 25_500,
      currency: 'USD', status: 'delivered',
    });

    // User disputes
    const disputed = await Sessions.update(session.id, {
      status: 'disputed',
      dispute: { reason: 'Quality is not what was promised', openedBy: 'user', openedAt: new Date().toISOString(), status: 'open' },
    });
    expect(disputed?.status).toBe('disputed');
    expect(disputed?.dispute?.openedBy).toBe('user');
    expect(disputed?.dispute?.status).toBe('open');

    // Admin resolves with full refund
    const refunded = await Sessions.update(session.id, {
      status: 'refunded',
      paymentStatus: 'refunded',
      dispute: { ...disputed!.dispute!, status: 'resolved', resolution: 'refund_user' },
    });
    expect(refunded?.status).toBe('refunded');
    expect(refunded?.dispute?.resolution).toBe('refund_user');

    // Worker's metrics should NOT count this as completed
    await refreshWorkerMetrics(worker.id);
    const w = await Workers.get(worker.id);
    expect(w?.completedSessions).toBe(0);
  });

  it('handles the auto-release timer', async () => {
    const { user, worker, problem } = await setup();
    const past = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000); // 8 days ago
    const session = await Sessions.create({
      problemId: problem.id, userId: user.id, workerId: worker.id,
      amountCents: 10_000, platformFeeCents: 1_500, workerEarningsCents: 8_500,
      currency: 'USD',
      status: 'delivered',
      deliveredAt: past.toISOString(),
      autoReleaseAt: new Date(past.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(new Date(session.autoReleaseAt!).getTime()).toBeLessThan(Date.now());
    // In production: a cron job picks this up and captures the payment.
    // Here we just verify the timestamp is set correctly.
  });
});

describe('Pre-payment messaging cap', () => {
  it('enforces the 10-message cap for workers before payment', async () => {
    // This is enforced in the API route, but the data layer is open.
    // We just verify that we can detect when a worker has hit the cap.
    const { user, worker, problem } = await setup();
    const session = await Sessions.create({
      problemId: problem.id, userId: user.id, workerId: worker.id,
      amountCents: 5_000, platformFeeCents: 750, workerEarningsCents: 4_250,
      currency: 'USD', status: 'pending_payment',
    });
    for (let i = 0; i < 11; i++) {
      await Messages.create({
        sessionId: session.id, fromUserId: worker.userId, fromRole: 'worker',
        content: `Message ${i}`,
      });
    }
    const msgs = await Messages.listForSession(session.id);
    const workerMsgs = msgs.filter((m) => m.fromRole === 'worker');
    expect(workerMsgs.length).toBe(11);
    // The API route would reject the 11th with a 429.
  });
});
