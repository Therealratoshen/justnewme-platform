// POST /api/sessions
// A worker claims a problem — this creates a session and reserves the
// problem. Returns the session so the worker can proceed to messaging
// and (optionally) the user can be prompted to fund escrow.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { Problems, Sessions, Workers, Events, Users } from '@/app/lib/data';
import { requireWorker } from '@/app/lib/auth';
import { errorResponse, jsonOk, parseJson, HttpError } from '@/app/lib/http';
import { notify } from '@/app/lib/notifications';

const ClaimInputSchema = z.object({
  problemId: z.string(),
  proposedPriceCents: z.number().int().min(1000).optional(),
  message: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireWorker();
    const worker = session.worker!;
    if (!worker.stripeOnboardingComplete) {
      throw new HttpError(412, 'onboarding_required', 'Complete Stripe Connect onboarding first.', {
        onboardingUrl: '/workers/onboarding',
      });
    }

    const body = await parseJson(req, (b) => ClaimInputSchema.parse(b));

    const problem = await Problems.get(body.problemId);
    if (!problem) throw new HttpError(404, 'problem_not_found', `No problem with id ${body.problemId}.`);
    if (problem.status !== 'open') {
      throw new HttpError(409, 'problem_unavailable', `Problem is already ${problem.status}.`);
    }

    // First-come claim. Production: also add a "claim window" so multiple
    // workers can express interest and the user picks.
    const price = body.proposedPriceCents ?? problem.budgetCents;
    const platformFee = Math.floor((price * 1500) / 10_000);
    const newSession = await Sessions.create({
      problemId: problem.id,
      userId: problem.postedByUserId,
      workerId: worker.id,
      amountCents: price,
      platformFeeCents: platformFee,
      workerEarningsCents: price - platformFee,
      currency: 'USD',
      status: 'pending_payment',
    });

    await Problems.update(problem.id, {
      status: 'claimed',
      claimedByWorkerId: worker.id,
      sessionId: newSession.id,
    });

    // First message: the worker's intro
    if (body.message) {
      const { Messages } = await import('@/app/lib/data');
      await Messages.create({
        sessionId: newSession.id,
        fromUserId: worker.userId,
        fromRole: 'worker',
        content: body.message,
      });
    }

    await Events.create({
      type: 'session_started',
      sessionId: newSession.id,
      problemId: problem.id,
      workerId: worker.id,
      userId: problem.postedByUserId,
    });

    // Notify the end user
    const poster = await Users.get(problem.postedByUserId);
    if (poster) {
      await notify({
        recipientUserId: poster.id,
        type: 'session_claimed',
        title: `${worker.displayName} wants to help`,
        body: `They claimed "${problem.title}" for $${(price / 100).toFixed(0)}.`,
        link: `/sessions/${newSession.id}`,
      });
    }

    return jsonOk({ session: newSession }, 201);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function GET(req: NextRequest) {
  try {
    const { getSession } = await import('@/app/lib/auth');
    const session = await getSession();
    if (!session) throw new HttpError(401, 'unauthenticated', 'Sign in first.');

    const url = new URL(req.url);
    const role = url.searchParams.get('role') ?? (session.worker ? 'worker' : 'user');

    let list;
    if (role === 'worker' && session.worker) {
      list = await Sessions.list({ workerId: session.worker.id });
    } else {
      list = await Sessions.list({ userId: session.user.id });
    }
    return jsonOk({ sessions: list });
  } catch (err) {
    return errorResponse(err);
  }
}
