// POST /api/sessions/:id/dispute
// Either side opens a dispute. Money stays in escrow until resolved.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { Sessions, Events } from '@/app/lib/data';
import { requireSession } from '@/app/lib/auth';
import { errorResponse, jsonOk, parseJson, HttpError } from '@/app/lib/http';
import { notify } from '@/app/lib/notifications';

const DisputeInputSchema = z.object({
  reason: z.string().min(10).max(2000),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireSession();
    const target = await Sessions.get(id);
    if (!target) throw new HttpError(404, 'not_found', `No session with id ${id}.`);

    const isUser = session.user.id === target.userId;
    const isWorker = session.worker?.id === target.workerId;
    if (!isUser && !isWorker) {
      throw new HttpError(403, 'forbidden', 'You are not a participant in this session.');
    }
    if (!['delivered', 'in_progress'].includes(target.status)) {
      throw new HttpError(409, 'invalid_state', `Cannot dispute when status is ${target.status}.`);
    }

    const body = await parseJson(req, (b) => DisputeInputSchema.parse(b));

    const updated = await Sessions.update(id, {
      status: 'disputed',
      dispute: {
        reason: body.reason,
        openedBy: isUser ? 'user' : 'worker',
        openedAt: new Date().toISOString(),
        status: 'open',
      },
    });

    await Events.create({
      type: 'session_disputed',
      sessionId: id,
      workerId: target.workerId,
      userId: target.userId,
      metadata: { reason: body.reason, openedBy: isUser ? 'user' : 'worker' },
    });

    // Notify admin (real impl: page on-call)
    const { Users } = await import('@/app/lib/data');
    const admins = (await Users.list()).filter((u) => u.role === 'admin');
    for (const admin of admins) {
      await notify({
        recipientUserId: admin.id,
        type: 'dispute_opened',
        title: `Dispute opened: ${target.id}`,
        body: body.reason.slice(0, 200),
        link: `/admin/disputes`,
      });
    }

    return jsonOk({ session: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
