// GET /api/sessions/:id
// Get the full session including messages.

import { NextRequest } from 'next/server';
import { Sessions, Messages, Problems, Workers, Users } from '@/app/lib/data';
import { getSession } from '@/app/lib/auth';
import { errorResponse, jsonOk, HttpError } from '@/app/lib/http';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await Sessions.get(id);
    if (!session) throw new HttpError(404, 'not_found', `No session with id ${id}.`);

    // Only the participants (or admin) can read.
    const viewer = await getSession();
    const isParticipant = viewer && (viewer.user.id === session.userId || viewer.worker?.id === session.workerId);
    const isAdmin = viewer?.user.role === 'admin';
    if (!isParticipant && !isAdmin) {
      throw new HttpError(403, 'forbidden', 'You are not a participant in this session.');
    }

    const [msgs, problem, worker, user] = await Promise.all([
      Messages.listForSession(id),
      Problems.get(session.problemId),
      Workers.get(session.workerId),
      Users.get(session.userId),
    ]);

    return jsonOk({
      session,
      messages: msgs,
      problem,
      worker: worker ? {
        id: worker.id,
        displayName: worker.displayName,
        headline: worker.headline,
        rating: worker.rating,
        portfolioUrl: worker.portfolioUrl,
      } : null,
      user: user ? { id: user.id, name: user.name, email: user.email } : null,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
