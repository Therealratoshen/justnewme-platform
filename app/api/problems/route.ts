// POST /api/problems
// An end user (or their AI agent) posts a problem. Returns the problem
// with a ranked list of workers who can claim it.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { Problems, Workers, Events, Notifications } from '@/app/lib/data';
import { requireSession, getSession } from '@/app/lib/auth';
import { errorResponse, jsonOk, parseJson, v, HttpError } from '@/app/lib/http';
import { notify } from '@/app/lib/notifications';
import { seedDevData } from '@/app/lib/data';

const ProblemInputSchema = z.object({
  title: z.string().min(5).max(140),
  description: z.string().min(20).max(8000),
  category: z.enum(['strategy', 'dev', 'design', 'legal', 'marketing', 'other']),
  skillsNeeded: z.array(z.string()).max(20).default([]),
  budgetCents: z.number().int().min(1000).max(10_000_00),
  budgetMaxCents: z.number().int().optional(),
  urgency: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  aiAgentContext: z.object({
    source: z.enum(['claude', 'cursor', 'chatgpt', 'other']),
    sessionId: z.string().optional(),
    chatTranscript: z.array(z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
      ts: z.string(),
    })).optional(),
    suggestedCategory: z.string().optional(),
  }).optional(),
});

export async function POST(req: NextRequest) {
  try {
    await seedDevData();
    const session = await requireSession();

    const body = await parseJson(req, (b) => ProblemInputSchema.parse(b));

    const problem = await Problems.create({
      postedByUserId: session.user.id,
      title: body.title,
      description: body.description,
      category: body.category,
      skillsNeeded: body.skillsNeeded,
      budgetCents: body.budgetCents,
      budgetMaxCents: body.budgetMaxCents,
      urgency: body.urgency,
      aiAgentContext: body.aiAgentContext,
      suggestedPriceCents: body.budgetCents, // for now, just use the budget
    });

    // Find matching workers and notify them
    const matches = await Workers.findMatchesForProblem(problem);
    for (const worker of matches.slice(0, 10)) {
      await Events.create({
        type: 'worker_claimed',
        problemId: problem.id,
        workerId: worker.id,
        metadata: { matchType: 'auto_ranked' },
      });
      await notify({
        recipientUserId: worker.userId,
        recipientWorkerId: worker.id,
        type: 'problem_match',
        title: `New problem matches your skills`,
        body: `"${problem.title}" — $${(problem.budgetCents / 100).toFixed(0)} · ${problem.category}`,
        link: `/workers/sessions/${problem.id}`, // worker clicks → goes to claim
      });
    }

    return jsonOk({
      problem,
      matchedWorkers: matches.slice(0, 5).map((w) => ({
        id: w.id,
        displayName: w.displayName,
        headline: w.headline,
        rating: w.rating,
        hourlyRate: w.hourlyRate,
      })),
    }, 201);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function GET(req: NextRequest) {
  try {
    await seedDevData();
    const session = await getSession();
    const url = new URL(req.url);
    const status = url.searchParams.get('status') as any;
    const scope = url.searchParams.get('scope') ?? 'mine';

    let list;
    if (scope === 'available' && session?.worker) {
      list = await Problems.listAvailableForWorker(session.worker.id);
    } else if (session?.user) {
      list = await Problems.list({
        userId: session.user.id,
        status: status ?? undefined,
      });
    } else {
      list = await Problems.list({ status: status ?? 'open' });
    }
    return jsonOk({ problems: list });
  } catch (err) {
    return errorResponse(err);
  }
}
