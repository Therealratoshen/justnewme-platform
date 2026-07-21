// GET /api/problems/:id
// PATCH /api/problems/:id
// DELETE /api/problems/:id

import { NextRequest } from 'next/server';
import { Problems } from '@/app/lib/data';
import { requireSession } from '@/app/lib/auth';
import { errorResponse, jsonOk, HttpError } from '@/app/lib/http';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const problem = await Problems.get(id);
    if (!problem) throw new HttpError(404, 'not_found', `No problem with id ${id}.`);
    return jsonOk({ problem });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireSession();
    const problem = await Problems.get(id);
    if (!problem) throw new HttpError(404, 'not_found', `No problem with id ${id}.`);
    if (problem.postedByUserId !== session.user.id) {
      throw new HttpError(403, 'forbidden', 'You can only edit your own problems.');
    }
    const body = await req.json();
    const updated = await Problems.update(id, body);
    return jsonOk({ problem: updated });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireSession();
    const problem = await Problems.get(id);
    if (!problem) throw new HttpError(404, 'not_found', `No problem with id ${id}.`);
    if (problem.postedByUserId !== session.user.id) {
      throw new HttpError(403, 'forbidden', 'You can only delete your own problems.');
    }
    await Problems.update(id, { status: 'cancelled' });
    return jsonOk({ cancelled: true });
  } catch (err) {
    return errorResponse(err);
  }
}
