// POST /api/admin/disputes/:id/resolve
// Admin resolves a dispute. Three options:
//   - refund_user: cancel the payment intent (money back to user)
//   - release_worker: capture the payment (worker gets paid)
//   - split: capture partial (Stripe supports this via transfer reversal)

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { Sessions, Events, Workers } from '@/app/lib/data';
import { requireAdmin } from '@/app/lib/auth';
import { errorResponse, jsonOk, parseJson, HttpError } from '@/app/lib/http';
import { captureEscrow, cancelEscrow } from '@/app/lib/stripe';
import { refreshWorkerMetrics } from '@/app/lib/quality';
import { notify } from '@/app/lib/notifications';

const ResolveInputSchema = z.object({
  resolution: z.enum(['refund_user', 'release_worker', 'split']),
  // For 'split' only — amount in cents to release to worker (rest refunded to user)
  splitReleaseCents: z.number().int().min(0).optional(),
  internalNote: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const target = await Sessions.get(id);
    if (!target) throw new HttpError(404, 'not_found', `No session with id ${id}.`);
    if (target.status !== 'disputed') {
      throw new HttpError(409, 'invalid_state', `Session is not disputed (${target.status}).`);
    }

    const body = await parseJson(req, (b) => ResolveInputSchema.parse(b));

    if (!target.stripePaymentIntentId) {
      throw new HttpError(412, 'no_payment', 'No payment intent to resolve.');
    }

    if (body.resolution === 'refund_user') {
      await cancelEscrow(target.stripePaymentIntentId);
      await Sessions.update(id, {
        status: 'refunded',
        paymentStatus: 'refunded',
        dispute: { ...target.dispute!, status: 'resolved', resolution: 'refund_user' },
      });
    } else if (body.resolution === 'release_worker') {
      await captureEscrow(target.stripePaymentIntentId);
      await Sessions.update(id, {
        status: 'approved',
        paymentStatus: 'captured',
        approvedAt: new Date().toISOString(),
        dispute: { ...target.dispute!, status: 'resolved', resolution: 'release_worker' },
      });
      const w = await Workers.get(target.workerId);
      if (w) {
        await Workers.update(target.workerId, {
          totalEarningsCents: w.totalEarningsCents + target.workerEarningsCents,
        });
        await refreshWorkerMetrics(target.workerId);
      }
    } else {
      // split: capture full, then transfer back the split portion to the user.
      // For demo we just record the resolution — production should use Stripe
      // reverse_transfer or a manual transfer.
      const release = body.splitReleaseCents ?? Math.floor(target.amountCents / 2);
      await captureEscrow(target.stripePaymentIntentId);
      await Sessions.update(id, {
        status: 'approved',
        paymentStatus: 'captured',
        dispute: { ...target.dispute!, status: 'resolved', resolution: 'split' },
      });
      console.log(`[admin ${admin.user.id}] split resolution: release ${release} to worker, refund ${target.amountCents - release} to user (session ${id})`);
    }

    await Events.create({
      type: 'dispute_resolved',
      sessionId: id,
      workerId: target.workerId,
      userId: target.userId,
      metadata: { resolution: body.resolution, adminId: admin.user.id, note: body.internalNote },
    });

    // Notify both parties
    await notify({
      recipientUserId: target.userId,
      type: 'dispute_opened',
      title: 'Dispute resolved',
      body: `Resolution: ${body.resolution.replace('_', ' ')}.`,
      link: `/sessions/${id}`,
    });
    const { Workers: WorkersTbl } = await import('@/app/lib/data');
    const worker = await WorkersTbl.get(target.workerId);
    if (worker) {
      await notify({
        recipientUserId: worker.userId,
        recipientWorkerId: worker.id,
        type: 'dispute_opened',
        title: 'Dispute resolved',
        body: `Resolution: ${body.resolution.replace('_', ' ')}.`,
        link: `/workers/sessions/${id}`,
      });
    }

    return jsonOk({ resolved: true, resolution: body.resolution });
  } catch (err) {
    return errorResponse(err);
  }
}
