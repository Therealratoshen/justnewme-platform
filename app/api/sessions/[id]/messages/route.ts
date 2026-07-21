// POST /api/sessions/:id/messages
// Send a message in the in-platform chat. Both user and worker can post.
// First N messages from a worker before payment count as "intro" — they
// shouldn't be the actual deliverable.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { Sessions, Messages, Workers, Users, Events } from '@/app/lib/data';
import { getSession } from '@/app/lib/auth';
import { errorResponse, jsonOk, parseJson, HttpError } from '@/app/lib/http';
import { notify } from '@/app/lib/notifications';

const MessageInputSchema = z.object({
  content: z.string().min(1).max(5000),
  attachments: z.array(z.object({
    name: z.string(),
    url: z.string().url(),
    sizeBytes: z.number().int().nonnegative(),
  })).max(10).optional(),
});

const MAX_PRE_PAYMENT_WORKER_MESSAGES = 10;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await Sessions.get(id);
    if (!session) throw new HttpError(404, 'not_found', `No session with id ${id}.`);

    const viewer = await getSession();
    if (!viewer) throw new HttpError(401, 'unauthenticated', 'Sign in first.');

    const isUser = viewer.user.id === session.userId;
    const isWorker = viewer.worker?.id === session.workerId;
    if (!isUser && !isWorker) {
      throw new HttpError(403, 'forbidden', 'You are not a participant in this session.');
    }

    // Pre-payment guard for workers: limit free pre-payment messages so
    // workers don't deliver full work for free and the user disappears.
    if (isWorker && session.status === 'pending_payment') {
      const existing = await Messages.listForSession(id);
      const workerMsgs = existing.filter((m) => m.fromRole === 'worker');
      if (workerMsgs.length >= MAX_PRE_PAYMENT_WORKER_MESSAGES) {
        throw new HttpError(429, 'pre_payment_limit', `Maximum ${MAX_PRE_PAYMENT_WORKER_MESSAGES} messages before payment. Ask the user to fund the session.`, {
          param: 'payment',
        });
      }
    }

    const body = await parseJson(req, (b) => MessageInputSchema.parse(b));

    const msg = await Messages.create({
      sessionId: id,
      fromUserId: viewer.user.id,
      fromRole: isWorker ? 'worker' : 'user',
      content: body.content,
      attachments: body.attachments,
    });

    // Notify the other party
    const { Workers: WorkersTbl } = await import('@/app/lib/data');
    const worker = await WorkersTbl.get(session.workerId);
    const recipientUserId = isWorker ? session.userId : worker!.userId;
    await notify({
      recipientUserId,
      type: 'message_received',
      title: isWorker ? `Message from ${viewer.worker!.displayName}` : 'New message from user',
      body: body.content.slice(0, 100),
      link: `/sessions/${id}`,
    });

    await Events.create({
      type: 'message_sent',
      sessionId: id,
      workerId: session.workerId,
      userId: session.userId,
    });

    return jsonOk({ message: msg }, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
