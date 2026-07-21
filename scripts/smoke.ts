// In-process smoke test for JustNewMe (no HTTP, no Stripe).
// Verifies the data + business logic end-to-end.
// Run: npm run smoke
//
// Mirrors the Solvemate smoke test pattern: assert the happy path,
// assert error paths, print a pass/fail summary.

import assert from 'node:assert/strict';
import { Users, Workers, Problems, Sessions, Messages, Events, seedDevData } from '../app/lib/data';
import { refreshWorkerMetrics, computeWorkerMetrics, detectQualityFlags } from '../app/lib/quality';
import { calculateMoney } from '../app/lib/stripe';

let pass = 0;
let fail = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    pass++;
    console.log('  PASS ', name);
  } catch (err: any) {
    fail++;
    console.error('  FAIL ', name, '→', err.message);
  }
}

async function main() {
  console.log('\n[smoke] JustNewMe v0.1 — in-process check\n');
  await seedDevData();

  await check('seed: Filbert is a worker', async () => {
    const list = await Workers.list();
    const filbert = list.find((w) => w.displayName === 'Filbert Henrico');
    assert.ok(filbert, 'Filbert should be seeded');
    assert.strictEqual(filbert!.status, 'active');
  });

  await check('seed: a sample problem exists', async () => {
    const list = await Problems.list();
    const p = list.find((p) => p.title.includes('AI strategy'));
    assert.ok(p, 'sample problem should be seeded');
  });

  await check('money: 15% platform fee on $300', async () => {
    const { platformFeeCents, workerEarningsCents } = calculateMoney(30_000);
    assert.strictEqual(platformFeeCents, 4_500);
    assert.strictEqual(workerEarningsCents, 25_500);
  });

  await check('matching: filbert matches AI strategy problems', async () => {
    const list = await Workers.list();
    const filbert = list.find((w) => w.displayName === 'Filbert Henrico')!;
    const available = await Problems.listAvailableForWorker(filbert.id);
    assert.ok(available.length >= 1, 'at least 1 match');
    const p = available.find((p) => p.title.includes('AI strategy'));
    assert.ok(p, 'should match the AI strategy problem');
  });

  await check('flow: claim → fund → message → deliver → approve', async () => {
    const filbert = (await Workers.list()).find((w) => w.displayName === 'Filbert Henrico')!;
    const poster = (await Users.list()).find((u) => u.role === 'end_user')!;
    const problem = (await Problems.list())[0];

    // claim
    const session = await Sessions.create({
      problemId: problem.id, userId: poster.id, workerId: filbert.id,
      amountCents: 30_000, platformFeeCents: 4_500, workerEarningsCents: 25_500,
      currency: 'USD', status: 'pending_payment',
    });
    await Problems.update(problem.id, { status: 'claimed', claimedByWorkerId: filbert.id, sessionId: session.id });

    // fund
    const funded = await Sessions.update(session.id, { status: 'in_progress', paymentStatus: 'authorized' });
    assert.strictEqual(funded?.status, 'in_progress');

    // message
    await Messages.create({ sessionId: session.id, fromUserId: filbert.userId, fromRole: 'worker', content: 'Hi!' });
    const msgs = await Messages.listForSession(session.id);
    assert.strictEqual(msgs.length, 1);

    // deliver
    const delivered = await Sessions.update(session.id, {
      status: 'delivered',
      deliveredAt: new Date().toISOString(),
      deliverable: { type: 'document', content: 'Done.', submittedAt: new Date().toISOString() },
    });
    assert.strictEqual(delivered?.status, 'delivered');

    // approve
    const approved = await Sessions.update(session.id, {
      status: 'approved',
      paymentStatus: 'captured',
      approvedAt: new Date().toISOString(),
      outcome: { rating: 5, ratedAt: new Date().toISOString() },
    });
    assert.strictEqual(approved?.status, 'approved');
    assert.strictEqual(approved?.outcome?.rating, 5);

    // metrics refresh
    await refreshWorkerMetrics(filbert.id);
    const refreshed = await Workers.get(filbert.id);
    assert.strictEqual(refreshed?.completedSessions, 1);
    assert.strictEqual(refreshed?.rating, 5);
  });

  await check('flow: dispute path → refund', async () => {
    const filbert = (await Workers.list()).find((w) => w.displayName === 'Filbert Henrico')!;
    const poster = (await Users.list()).find((u) => u.role === 'end_user')!;
    const problem = await Problems.create({
      postedByUserId: poster.id, title: 'Dispute test', description: 'A description with enough length',
      category: 'strategy', skillsNeeded: ['ai_strategy'], budgetCents: 5_000, urgency: 'normal',
    });
    const session = await Sessions.create({
      problemId: problem.id, userId: poster.id, workerId: filbert.id,
      amountCents: 5_000, platformFeeCents: 750, workerEarningsCents: 4_250,
      currency: 'USD', status: 'delivered',
    });
    const disputed = await Sessions.update(session.id, {
      status: 'disputed',
      dispute: { reason: 'Quality not as expected', openedBy: 'user', openedAt: new Date().toISOString(), status: 'open' },
    });
    assert.strictEqual(disputed?.status, 'disputed');

    const refunded = await Sessions.update(session.id, {
      status: 'refunded',
      paymentStatus: 'refunded',
      dispute: { ...disputed!.dispute!, status: 'resolved', resolution: 'refund_user' },
    });
    assert.strictEqual(refunded?.status, 'refunded');
  });

  await check('QA: detect quality flags on a bad worker', async () => {
    const u = await Users.create({ email: 'flagged@example.com', name: 'F', role: 'worker' });
    const w = await Workers.create({
      userId: u.id, displayName: 'F', headline: '', bio: '',
      skills: [], categories: ['dev'],
      hourlyRate: 100, currency: 'USD', status: 'active',
    });
    // 5 sessions: 3 approved + 2 disputed = 40% dispute rate (over the 20% threshold)
    // and 3 completed (over the 3-session minimum)
    for (let i = 0; i < 5; i++) {
      const poster = await Users.create({ email: `p${i}-${Math.random()}@example.com`, name: 'P', role: 'end_user' });
      const p = await Problems.create({
        postedByUserId: poster.id, title: 'F', description: 'A description with enough length',
        category: 'dev', skillsNeeded: [], budgetCents: 1_000, urgency: 'low',
      });
      await Sessions.create({
        problemId: p.id, userId: poster.id, workerId: w.id,
        amountCents: 1_000, platformFeeCents: 150, workerEarningsCents: 850,
        currency: 'USD', status: i < 2 ? 'disputed' : 'approved',
      });
    }
    await refreshWorkerMetrics(w.id);
    const flags = await detectQualityFlags(w.id);
    assert.ok(flags.some((f) => f.reason.includes('Dispute rate')), 'should flag dispute rate');
  });

  console.log(`\n[smoke] ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('[smoke] crashed', err);
  process.exit(2);
});
