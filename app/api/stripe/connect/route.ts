// POST /api/stripe/connect
// Worker initiates Stripe Connect onboarding. Returns the URL to redirect to.
//
// GET /api/stripe/connect
// Check the worker's onboarding status.

import { NextRequest } from 'next/server';
import { requireWorker } from '@/app/lib/auth';
import { Workers } from '@/app/lib/data';
import { errorResponse, jsonOk, HttpError } from '@/app/lib/http';
import { createConnectAccount, refreshConnectOnboarding, isConnectAccountReady } from '@/app/lib/stripe';

export async function POST(_req: NextRequest) {
  try {
    const session = await requireWorker();
    const worker = session.worker!;

    let onboardingUrl: string;
    if (!worker.stripeAccountId) {
      const result = await createConnectAccount({
        email: session.user.email,
        country: worker.country === 'Indonesia' ? 'ID' : (worker.country === 'Singapore' ? 'SG' : 'US'),
        workerId: worker.id,
      });
      await Workers.update(worker.id, { stripeAccountId: result.accountId });
      onboardingUrl = result.onboardingUrl;
    } else {
      onboardingUrl = await refreshConnectOnboarding(worker.stripeAccountId);
    }

    return jsonOk({ onboardingUrl });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function GET(_req: NextRequest) {
  try {
    const session = await requireWorker();
    const worker = session.worker!;
    if (!worker.stripeAccountId) {
      return jsonOk({ connected: false, onboardingComplete: false });
    }
    const ready = await isConnectAccountReady(worker.stripeAccountId);
    if (ready && !worker.stripeOnboardingComplete) {
      await Workers.update(worker.id, { stripeOnboardingComplete: true });
    }
    return jsonOk({
      connected: true,
      onboardingComplete: worker.stripeOnboardingComplete || ready,
      stripeAccountId: worker.stripeAccountId,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
