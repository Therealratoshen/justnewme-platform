// Worker onboarding page — kicks off Stripe Connect.

import { redirect } from 'next/navigation';
import { getSession } from '@/app/lib/auth';
import { Workers } from '@/app/lib/data';
import { IS_DEMO_MODE, markDemoAccountReady } from '@/app/lib/stripe';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ demo_account?: string }> }) {
  const session = await getSession();
  if (!session?.worker) redirect('/workers/dashboard');

  const { demo_account } = await searchParams;

  // If we just returned from the demo onboarding, mark the mock account ready
  if (demo_account && IS_DEMO_MODE) {
    const ok = markDemoAccountReady(demo_account);
    if (ok) {
      await Workers.update(session.worker.id, { stripeOnboardingComplete: true });
      redirect('/workers/dashboard?onboarded=1');
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-20">
      <h1 className="text-3xl font-bold">Get paid for your work</h1>
      <p className="mt-3 text-ink-600">
        JustNewMe uses Stripe Connect to pay workers directly. You&apos;ll
        set up a Stripe Express account, link your bank, and we&apos;ll
        send your earnings there automatically.
      </p>

      {IS_DEMO_MODE && (
        <div className="mt-4 p-3 rounded-md bg-blue-50 border border-blue-200 text-sm text-blue-900">
          <strong>Demo mode is on.</strong> Stripe calls are mocked locally so you can exercise the full
          marketplace flow without API keys. The &ldquo;onboarding&rdquo; step below just marks your account
          as ready in the local mock store. Set <code>STRIPE_SECRET_KEY</code> in <code>.env.local</code>{' '}
          to use real Stripe.
        </div>
      )}

      <div className="mt-8 p-6 rounded-lg border border-ink-200 bg-white">
        <h2 className="font-semibold">Setup checklist</h2>
        <ul className="mt-3 space-y-2 text-sm text-ink-600">
          <li>✅ Create a JustNewMe worker account</li>
          <li>{session.worker.stripeOnboardingComplete ? '✅' : '⏳'} Complete Stripe identity verification</li>
          <li>{session.worker.stripeOnboardingComplete ? '✅' : '⏳'} Link a bank account for payouts</li>
          <li>⏳ Start claiming problems</li>
        </ul>

        <form action="/api/stripe/connect" method="POST" className="mt-6">
          <button
            type="submit"
            className="w-full px-4 py-3 rounded-md bg-brand-600 text-white font-medium hover:bg-brand-700"
          >
            {IS_DEMO_MODE ? 'Complete demo onboarding →' : 'Continue with Stripe →'}
          </button>
        </form>

        <p className="text-xs text-ink-400 mt-3">
          {IS_DEMO_MODE
            ? 'This marks your account as ready in the local demo store. No real money moves.'
            : 'You\u2019ll be redirected to Stripe to complete verification. We never see your bank details.'}
        </p>

        {session.worker.stripeOnboardingComplete && (
          <div className="mt-4 p-3 rounded-md bg-green-50 border border-green-200 text-sm text-green-900">
            Onboarding complete!{' '}
            <Link href="/workers/dashboard" className="underline">
              Back to dashboard →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
