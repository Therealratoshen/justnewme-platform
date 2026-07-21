// JustNewMe — Stripe integration
// Real Stripe Connect code. In dev, set STRIPE_SECRET_KEY to a test key
// from https://dashboard.stripe.com/test/apikeys
//
// Demo mode: if JUSTNEWME_DEMO_MODE=true, the Stripe calls become local
// mocks so the full marketplace flow can be exercised without keys.
// Set this in .env.local for development.

import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const PLATFORM_FEE_BPS = parseInt(process.env.JUSTNEWME_PLATFORM_FEE_BPS ?? '1500', 10);
const DEMO_MODE = process.env.JUSTNEWME_DEMO_MODE === 'true' || !STRIPE_SECRET_KEY;

let _stripe: Stripe | null = null;

/**
 * Lazy-initialized Stripe client. Throws if no key is set AND not in demo mode.
 * Use in API routes — call getStripe() at request time, not at module load.
 */
export function getStripe(): Stripe {
  if (DEMO_MODE) {
    throw new Error('Stripe is in demo mode (JUSTNEWME_DEMO_MODE=true or no STRIPE_SECRET_KEY). Use the mock helpers instead.');
  }
  if (!_stripe) {
    _stripe = new Stripe(STRIPE_SECRET_KEY!, {
      apiVersion: '2024-06-20',
      typescript: true,
      appInfo: { name: 'JustNewMe', version: '0.1.0' },
    });
  }
  return _stripe;
}

export const IS_DEMO_MODE = DEMO_MODE;
export const PLATFORM_FEE_BPS_CONSTANT = PLATFORM_FEE_BPS;

// ---------- Mock helpers (demo mode) ----------

interface MockStore {
  accounts: Map<string, { id: string; email: string; ready: boolean }>;
  paymentIntents: Map<string, { id: string; amount: number; status: 'requires_capture' | 'succeeded' | 'canceled'; destination: string }>;
}

const MOCK_KEY = '__justnewme_stripe_mock__';
function getMockStore(): MockStore {
  const g = globalThis as any;
  if (!g[MOCK_KEY]) {
    g[MOCK_KEY] = { accounts: new Map(), paymentIntents: new Map() };
  }
  return g[MOCK_KEY];
}

function mockId(prefix: string): string {
  return `${prefix}_mock_${Math.random().toString(36).slice(2, 14)}`;
}

// ---------- Public API ----------

/**
 * Create a Stripe Connect Express account for a worker.
 * The worker completes onboarding via the returned account link.
 */
export async function createConnectAccount(input: {
  email: string;
  country?: string;
  workerId: string;
}): Promise<{ accountId: string; onboardingUrl: string }> {
  if (DEMO_MODE) {
    const store = getMockStore();
    const accountId = mockId('acct');
    store.accounts.set(accountId, { id: accountId, email: input.email, ready: false });
    // In demo mode, the "onboarding URL" is a local endpoint that marks the account ready
    const base = process.env.NEXT_PUBLIC_URL ?? 'http://localhost:3456';
    return {
      accountId,
      onboardingUrl: `${base}/workers/onboarding?demo_account=${accountId}`,
    };
  }
  const stripe = getStripe();
  const account = await stripe.accounts.create({
    type: 'express',
    country: input.country ?? 'US',
    email: input.email,
    capabilities: {
      transfers: { requested: true },
      card_payments: { requested: true },
    },
    metadata: { workerId: input.workerId },
  });
  const link = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: `${process.env.NEXT_PUBLIC_URL ?? 'http://localhost:3456'}/workers/onboarding?refresh=1`,
    return_url: `${process.env.NEXT_PUBLIC_URL ?? 'http://localhost:3456'}/workers/dashboard?onboarded=1`,
    type: 'account_onboarding',
  });
  return { accountId: account.id, onboardingUrl: link.url };
}

/**
 * Generate a new onboarding link for a worker who hasn't finished.
 */
export async function refreshConnectOnboarding(accountId: string): Promise<string> {
  if (DEMO_MODE) {
    const base = process.env.NEXT_PUBLIC_URL ?? 'http://localhost:3456';
    return `${base}/workers/onboarding?demo_account=${accountId}`;
  }
  const stripe = getStripe();
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${process.env.NEXT_PUBLIC_URL ?? 'http://localhost:3456'}/workers/onboarding?refresh=1`,
    return_url: `${process.env.NEXT_PUBLIC_URL ?? 'http://localhost:3456'}/workers/dashboard?onboarded=1`,
    type: 'account_onboarding',
  });
  return link.url;
}

/**
 * Mark a mock Connect account as ready (demo mode only).
 * Hit via /workers/onboarding?demo_account=acct_mock_xxx
 */
export function markDemoAccountReady(accountId: string): boolean {
  if (!DEMO_MODE) return false;
  const acc = getMockStore().accounts.get(accountId);
  if (!acc) return false;
  acc.ready = true;
  return true;
}

/**
 * Check whether a Connect account has completed onboarding.
 */
export async function isConnectAccountReady(accountId: string): Promise<boolean> {
  if (DEMO_MODE) {
    // In demo mode, any account that ends in _demo is considered ready.
    // Otherwise check the mock store.
    if (accountId.endsWith('_demo')) return true;
    return getMockStore().accounts.get(accountId)?.ready ?? false;
  }
  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(accountId);
  return Boolean(account.charges_enabled && account.payouts_enabled);
}

/**
 * Create a payment intent for a session. Money is AUTHORIZED but not
 * captured — this is the escrow. We capture (release to worker) when
 * the user approves the work, or refund if disputed.
 */
export async function createEscrowPaymentIntent(input: {
  amountCents: number;
  currency: 'USD';
  workerStripeAccountId: string;
  sessionId: string;
  problemTitle: string;
  customerEmail: string;
}): Promise<{ paymentIntentId: string; clientSecret: string }> {
  if (DEMO_MODE) {
    const store = getMockStore();
    const id = mockId('pi');
    store.paymentIntents.set(id, {
      id, amount: input.amountCents, status: 'requires_capture', destination: input.workerStripeAccountId,
    });
    return { paymentIntentId: id, clientSecret: `${id}_secret_mock` };
  }
  const stripe = getStripe();
  const platformFee = Math.floor((input.amountCents * PLATFORM_FEE_BPS) / 10_000);
  const intent = await stripe.paymentIntents.create({
    amount: input.amountCents,
    currency: input.currency.toLowerCase(),
    capture_method: 'manual', // ← escrow: authorize, capture on approval
    application_fee_amount: platformFee,
    transfer_data: { destination: input.workerStripeAccountId },
    receipt_email: input.customerEmail,
    metadata: { sessionId: input.sessionId, problemTitle: input.problemTitle },
  });
  return { paymentIntentId: intent.id, clientSecret: intent.client_secret! };
}

/** Capture the authorized payment — releases funds to worker. */
export async function captureEscrow(paymentIntentId: string): Promise<void> {
  if (DEMO_MODE) {
    const pi = getMockStore().paymentIntents.get(paymentIntentId);
    if (!pi) throw new Error(`No mock PaymentIntent ${paymentIntentId}`);
    if (pi.status !== 'requires_capture') {
      throw new Error(`Cannot capture: status is ${pi.status}`);
    }
    pi.status = 'succeeded';
    return;
  }
  const stripe = getStripe();
  await stripe.paymentIntents.capture(paymentIntentId);
}

/** Cancel the authorization without capturing — refunds the user. */
export async function cancelEscrow(paymentIntentId: string): Promise<void> {
  if (DEMO_MODE) {
    const pi = getMockStore().paymentIntents.get(paymentIntentId);
    if (!pi) throw new Error(`No mock PaymentIntent ${paymentIntentId}`);
    pi.status = 'canceled';
    return;
  }
  const stripe = getStripe();
  await stripe.paymentIntents.cancel(paymentIntentId);
}

/** Verify a webhook signature. Throws if invalid. In demo mode, no-op. */
export function verifyWebhook(payload: string, signature: string): Stripe.Event {
  if (DEMO_MODE) {
    // In demo mode, parse the payload directly. Production MUST verify the signature.
    return JSON.parse(payload) as Stripe.Event;
  }
  if (!STRIPE_WEBHOOK_SECRET) throw new Error('STRIPE_WEBHOOK_SECRET is not set');
  const stripe = getStripe();
  return stripe.webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET);
}

/**
 * Calculate platform fee and worker earnings for a given session amount.
 */
export function calculateMoney(amountCents: number): {
  platformFeeCents: number;
  workerEarningsCents: number;
} {
  const platformFeeCents = Math.floor((amountCents * PLATFORM_FEE_BPS) / 10_000);
  return {
    platformFeeCents,
    workerEarningsCents: amountCents - platformFeeCents,
  };
}
