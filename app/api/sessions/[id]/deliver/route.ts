// POST /api/sessions/:id/deliver
// Worker submits the deliverable. This moves the session to "delivered"
// and starts the auto-release clock.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { Sessions, Problems, Events, Workers } from '@/app/lib/data';
import { requireWorker } from '@/app/lib/auth';
import { errorResponse, jsonOk, parseJson, HttpError } from '@/app/lib/http';
import { notify } from '@/app/lib/notifications';
import { refreshWorkerMetrics } from '@/app/lib/quality';

const DeliverInputSchema = z.object({
  type: z.enum(['document', 'link', 'message', 'call_summary']).default('message'),
  content: z.string().min(1).max(20000),
  files: z.array(z.object({
    name: z.string(),
    url: z.string().url(),
    sizeBytes: z.number().int().nonnegative(),
  })).max(20).optional(),
});

const AUTO_RELEASE_DAYS = 7;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireWorker();
    const worker = session.worker!;

    const target = await Sessions.get(id);
    if (!target) throw new HttpError(404, 'not_found', `No session with id ${id}.`);
    if (target.workerId !== worker.id) {
      throw new HttpError(403, 'forbidden', 'You are not the worker on this session.');
    }
    if (!['in_progress', 'delivered'].includes(target.status)) {
      throw new HttpError(409, 'invalid_state', `Cannot deliver when status is ${target.status}.`);
    }

    const body = await parseJson(req, (b) => DeliverInputSchema.parse(b));

    const now = new Date();
    const autoRelease = new Date(now.getTime() + AUTO_RELEASE_DAYS * 24 * 60 * 60 * 1000);

    const updated = await Sessions.update(id, {
      status: 'delivered',
      deliveredAt: now.toISOString(),
      autoReleaseAt: autoRelease.toISOString(),
      deliverable: {
        type: body.type,
        content: body.content,
        files: body.files,
        submittedAt: now.toISOString(),
      },
    });

    await Problems.update(target.problemId, { status: 'delivered' });

    await Events.create({
      type: 'deliverable_submitted',
      sessionId: id,
      workerId: worker.id,
      userId: target.userId,
    });

    await notify({
      recipientUserId: target.userId,
      type: 'deliverable_ready',
      title: `${worker.displayName} delivered your work`,
      body: `Review and approve to release $${(target.amountCents / 100).toFixed(0)} to the worker.`,
      link: `/sessions/${id}`,
    });

    return jsonOk({ session: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
