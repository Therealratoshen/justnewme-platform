// POST /api/stripe/escrow
// End user funds the session. Creates a payment intent with
// capture_method: 'manual' — the money is authorized but not captured.
// Capture happens when the user approves the deliverable.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { Sessions, Workers, Users, Events } from '@/app/lib/data';
import { requireSession } from '@/app/lib/auth';
import { errorResponse, jsonOk, parseJson, HttpError } from '@/app/lib/http';
import { createEscrowPaymentIntent } from '@/app/lib/stripe';
import { notify } from '@/app/lib/notifications';

const EscrowInputSchema = z.object({
  sessionId: z.string(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await parseJson(req, (b) => EscrowInputSchema.parse(b));

    const target = await Sessions.get(body.sessionId);
    if (!target) throw new HttpError(404, 'not_found', `No session with id ${body.sessionId}.`);
    if (target.userId !== session.user.id) {
      throw new HttpError(403, 'forbidden', 'You are not the user on this session.');
    }
    if (target.status !== 'pending_payment') {
      throw new HttpError(409, 'invalid_state', `Session is already ${target.status}.`);
    }
    if (target.stripePaymentIntentId) {
      // Already funded — return the existing intent
      return jsonOk({
        sessionId: target.id,
        paymentIntentId: target.stripePaymentIntentId,
        amountCents: target.amountCents,
        clientSecret: null, // would need to look up; not strictly needed here
        alreadyFunded: true,
      });
    }

    const worker = await Workers.get(target.workerId);
    if (!worker?.stripeAccountId) {
      throw new HttpError(412, 'worker_not_payable', 'Worker has not finished payment setup.');
    }
    const problem = await (await import('@/app/lib/data')).Problems.get(target.problemId);
    const user = await Users.get(target.userId);

    const { paymentIntentId, clientSecret } = await createEscrowPaymentIntent({
      amountCents: target.amountCents,
      currency: 'USD',
      workerStripeAccountId: worker.stripeAccountId,
      sessionId: target.id,
      problemTitle: problem?.title ?? 'JustNewMe session',
      customerEmail: user?.email ?? session.user.email,
    });

    await Sessions.update(target.id, {
      stripePaymentIntentId: paymentIntentId,
      paymentStatus: 'authorized',
      status: 'in_progress',
    });

    await Events.create({
      type: 'session_started',
      sessionId: target.id,
      workerId: target.workerId,
      userId: target.userId,
      metadata: { event: 'escrow_funded' },
    });

    await notify({
      recipientUserId: worker.userId,
      recipientWorkerId: worker.id,
      type: 'session_claimed',
      title: 'Session funded — get to work',
      body: `$${(target.amountCents / 100).toFixed(0)} held in escrow. Deliver to release.`,
      link: `/workers/sessions/${target.id}`,
    });

    return jsonOk({
      sessionId: target.id,
      paymentIntentId,
      clientSecret,
      amountCents: target.amountCents,
    }, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
