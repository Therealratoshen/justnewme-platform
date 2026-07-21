// PATCH /api/admin/workers/:id
// Update worker status (suspend / ban / activate).

import { NextRequest } from 'next/server';
import { Workers, Events } from '@/app/lib/data';
import { requireAdmin } from '@/app/lib/auth';
import { errorResponse, jsonOk, parseJson, HttpError } from '@/app/lib/http';
import type { WorkerStatus } from '@/app/lib/types';

const ALLOWED_STATUSES: WorkerStatus[] = ['pending_verification', 'active', 'suspended', 'banned'];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await parseJson(req, (b: any) => {
      if (!ALLOWED_STATUSES.includes(b.status)) {
        throw new HttpError(422, 'invalid_status', `status must be one of: ${ALLOWED_STATUSES.join(', ')}.`);
      }
      return b as { status: WorkerStatus; reason?: string };
    });
    const worker = await Workers.get(id);
    if (!worker) throw new HttpError(404, 'not_found', `No worker with id ${id}.`);

    const updated = await Workers.update(id, { status: body.status });

    await Events.create({
      type: body.status === 'banned' ? 'worker_banned' : body.status === 'suspended' ? 'worker_suspended' : 'worker_claimed',
      workerId: id,
      metadata: { adminId: admin.user.id, reason: body.reason, prevStatus: worker.status },
    });

    return jsonOk({ worker: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
