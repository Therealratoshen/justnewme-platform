// POST /api/stripe/webhook
// Handle Stripe events. Most importantly: payment_intent.canceled (refund)
// and account.updated (Connect onboarding finished).

import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhook } from '@/app/lib/stripe';
import { Sessions, Workers, Events } from '@/app/lib/data';
import { refreshWorkerMetrics } from '@/app/lib/quality';
import { errorResponse } from '@/app/lib/http';

export async function POST(req: NextRequest) {
  try {
    const payload = await req.text();
    const sig = req.headers.get('stripe-signature');
    if (!sig) return NextResponse.json({ error: 'missing signature' }, { status: 400 });

    const event = verifyWebhook(payload, sig);

    switch (event.type) {
      case 'payment_intent.canceled': {
        const pi = event.data.object as any;
        const sessionId = pi.metadata?.sessionId;
        if (sessionId) {
          await Sessions.update(sessionId, { paymentStatus: 'refunded', status: 'refunded' });
          await Events.create({ type: 'refund_issued', sessionId, metadata: { reason: 'pi_canceled' } });
        }
        break;
      }

      case 'payment_intent.succeeded': {
        // Capture succeeded — funds are now in the worker's connected account
        const pi = event.data.object as any;
        const sessionId = pi.metadata?.sessionId;
        if (sessionId) {
          const s = await Sessions.get(sessionId);
          if (s) {
            await Sessions.update(sessionId, { paymentStatus: 'captured' });
            const w = await Workers.get(s.workerId);
            if (w) {
              await Workers.update(s.workerId, {
                totalEarningsCents: w.totalEarningsCents + s.workerEarningsCents,
              });
              await refreshWorkerMetrics(s.workerId);
            }
          }
        }
        break;
      }

      case 'account.updated': {
        // Worker Connect account status changed
        const account = event.data.object as any;
        const workerId = account.metadata?.workerId;
        if (workerId) {
          const ready = Boolean(account.charges_enabled && account.payouts_enabled);
          if (ready) {
            await Workers.update(workerId, { stripeOnboardingComplete: true });
          }
        }
        break;
      }

      default:
        // Unhandled event type — Stripe expects 2xx
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    return errorResponse(err);
  }
}
