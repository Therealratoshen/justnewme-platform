// POST /api/sessions/:id/approve
// User approves the deliverable. Captures the payment (releases escrow
// to the worker), records the outcome, and refreshes worker metrics.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { Sessions, Problems, Events } from '@/app/lib/data';
import { requireSession } from '@/app/lib/auth';
import { errorResponse, jsonOk, parseJson, HttpError } from '@/app/lib/http';
import { captureEscrow } from '@/app/lib/stripe';
import { refreshWorkerMetrics } from '@/app/lib/quality';
import { notify } from '@/app/lib/notifications';

const ApproveInputSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireSession();
    const target = await Sessions.get(id);
    if (!target) throw new HttpError(404, 'not_found', `No session with id ${id}.`);
    if (target.userId !== session.user.id) {
      throw new HttpError(403, 'forbidden', 'You are not the user on this session.');
    }
    if (target.status !== 'delivered') {
      throw new HttpError(409, 'invalid_state', `Cannot approve when status is ${target.status}.`);
    }

    const body = await parseJson(req, (b) => ApproveInputSchema.parse(b));

    // Capture the payment (release escrow to worker)
    if (target.stripePaymentIntentId) {
      try {
        await captureEscrow(target.stripePaymentIntentId);
      } catch (err) {
        console.error('[jnm] capture failed', err);
        throw new HttpError(500, 'payment_capture_failed', 'Could not release escrow. Try again or open a dispute.');
      }
    }

    const updated = await Sessions.update(id, {
      status: 'approved',
      paymentStatus: 'captured',
      approvedAt: new Date().toISOString(),
      outcome: {
        rating: body.rating as 1 | 2 | 3 | 4 | 5,
        comment: body.comment,
        ratedAt: new Date().toISOString(),
      },
    });

    await Problems.update(target.problemId, { status: 'completed' });

    await Events.create({
      type: 'session_approved',
      sessionId: id,
      workerId: target.workerId,
      userId: target.userId,
      metadata: { rating: body.rating },
    });

    // Refresh worker's quality metrics — drives future matching
    await refreshWorkerMetrics(target.workerId);

    // Notify the worker
    const { Workers, Users } = await import('@/app/lib/data');
    const worker = await Workers.get(target.workerId);
    if (worker) {
      await notify({
        recipientUserId: worker.userId,
        recipientWorkerId: worker.id,
        type: 'payout_sent',
        title: `Approved! +$${(target.workerEarningsCents / 100).toFixed(2)}`,
        body: `User rated you ${body.rating}/5.${body.comment ? ` "${body.comment}"` : ''}`,
        link: `/workers/dashboard`,
      });
    }

    return jsonOk({ session: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
