# JustNewMe

> When your AI can't solve it, JustNewMe finds the human who can.

A marketplace for AI agent–mediated human expertise. AI agents (Claude, Cursor, ChatGPT) install the JustNewMe MCP tool; when their own skills fail, they route the problem to a vetted human expert. Money is held in escrow and released on user approval. Outcomes are rated.

## What this repo contains

The full platform — the marketplace engine, the worker dashboard, the user session page, the admin back-office, and the Stripe Connect + escrow flow. Everything is real, working code (in-memory store, but the interfaces match what a real DB layer would expose).

```
app/
├── api/                          # API routes
│   ├── problems/                 #   post + list + get
│   ├── sessions/                 #   claim + message + deliver + approve + dispute
│   ├── stripe/                   #   Connect onboarding + escrow + webhook
│   ├── admin/                    #   disputes queue + worker management
│   └── auth/                     #   demo login (replace with real auth)
├── lib/                          # shared libs
│   ├── data.ts                   # in-memory store, swappable for Supabase
│   ├── types.ts                  # domain types
│   ├── auth.ts                   # session helpers
│   ├── stripe.ts                 # Stripe Connect + escrow helpers
│   ├── quality.ts                # worker reputation + auto-flag rules
│   ├── notifications.ts          # notification dispatcher
│   └── http.ts                   # response shaping + error helpers
├── workers/                      # worker-facing pages
│   ├── dashboard/                #   feed of available problems + earnings
│   ├── sessions/[id]/            #   active session workspace
│   └── onboarding/               #   Stripe Connect setup
├── sessions/[id]/                # user-facing session page
├── admin/                        # admin back-office
│   ├── page.tsx                  #   GMV, dispute count, flag counts
│   ├── disputes/                 #   resolve queue (refund/release/split)
│   └── workers/                  #   worker quality table + suspend/ban
└── components/                   # React components (chat, dispute card, etc.)

tests/
├── unit/                         # data + quality + stripe math
├── integration/                  # full session lifecycle
└── e2e/                          # API E2E via Playwright

scripts/
└── smoke.ts                      # in-process smoke test (no HTTP)
```

## Quick start

```bash
npm install
cp .env.example .env.local
# Add your Stripe test keys to .env.local
npm run dev
# → http://localhost:3456

# In another terminal
npm test                # unit + integration (Vitest)
npm run test:e2e        # API E2E (Playwright)
npm run smoke           # in-process smoke test
```

## The full flow

```
[User in Claude / Cursor / ChatGPT]
   ↓ types a problem
[AI agent calls JustNewMe MCP tools]
   ↓ post_problem
[JustNewMe stores the problem + matches workers]
   ↓ notify matching workers
[Worker A claims → session created]
   ↓
[User funds the session via Stripe]
   ↓ money authorized (not captured)
[Worker + user exchange in-platform messages]
   ↓
[Worker submits deliverable]
   ↓
[User reviews → approves]
   ↓ capture: money releases to worker (minus 15% fee)
[Outcome logged + worker reputation updated]
```

## Run the demo

1. `npm run dev` → http://localhost:3456
2. Click **"See the worker dashboard"** → land on Filbert's dashboard (auto-logged-in for the demo)
3. The dashboard shows the seed problem "AI strategy for Indonesian neobank"
4. Click **"Claim →"** to create a session
5. Open a new private window and visit `http://localhost:3456/api/auth/demo-login` to log in as the demo user
6. Go to the session page → "Fund escrow" → "Approve & release"

## API surface

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/problems` | Post a problem (user or AI agent) |
| `GET` | `/api/problems?scope=available` | List problems a worker can claim |
| `POST` | `/api/sessions` | Worker claims a problem |
| `POST` | `/api/sessions/:id/messages` | Send a message |
| `POST` | `/api/sessions/:id/deliver` | Worker submits deliverable |
| `POST` | `/api/sessions/:id/approve` | User approves + releases escrow |
| `POST` | `/api/sessions/:id/dispute` | Either side opens a dispute |
| `POST` | `/api/stripe/connect` | Worker starts Stripe Connect onboarding |
| `POST` | `/api/stripe/escrow` | User funds the session (creates PaymentIntent) |
| `POST` | `/api/stripe/webhook` | Stripe events (account.updated, payment_intent.*) |
| `GET` | `/api/admin/disputes` | Admin: open disputes queue |
| `POST` | `/api/admin/disputes/:id/resolve` | Admin: refund / release / split |
| `GET` | `/api/admin/workers` | Admin: worker quality + flags |
| `PATCH` | `/api/admin/workers/:id` | Admin: suspend / ban / activate |

## QA / testing strategy

| Layer | What we test | Tool |
|---|---|---|
| **Data layer** | CRUD, indexes, math (15% fee, expiry, matching) | Vitest unit tests |
| **Quality metrics** | Reputation computation, flag detection thresholds | Vitest unit tests |
| **Stripe math** | Platform fee rounding | Vitest unit tests |
| **Session lifecycle** | Post → claim → fund → message → deliver → approve → dispute | Vitest integration |
| **API end-to-end** | Real HTTP requests through Next.js routes | Playwright E2E |
| **Smoke test** | In-process happy path, no HTTP, no Stripe | `scripts/smoke.ts` |

The auto-flag system watches for: dispute rate > 20%, rating < 3.5, response time > 24h, completion rate < 70% — each over a minimum of 3 sessions. See `app/lib/quality.ts`.

## Deploy to Vercel

```bash
vercel --prod
```

Add the env vars from `.env.example` in the Vercel dashboard. The Stripe webhook needs to be configured in the Stripe dashboard pointing to `https://<your-domain>/api/stripe/webhook`.

## From this scaffold to production

The things you'd need to swap before going live:

- [ ] **Real auth** — replace `app/lib/auth.ts` with real auth (Clerk, Supabase Auth, NextAuth)
- [ ] **Real database** — replace `app/lib/data.ts` with Supabase or Postgres. Same interface.
- [ ] **Email delivery** — wire `app/lib/notifications.ts` to Resend or Postmark
- [ ] **Real payment element** — replace the alert in `FundEscrowButton` with Stripe Elements
- [ ] **MCP server package** — `npm publish` the `@justnewme/mcp-server` separately
- [ ] **Identity verification** for workers — Stripe Identity on signup
- [ ] **Real-time messaging** — replace 5s polling in `SessionChat` with WebSockets or Pusher

### Important: serverless state

The in-memory store works perfectly on a single Node process (your dev server,
or a long-running server). On Vercel serverless, each cold start gets a fresh
store, so state doesn't persist between **different** serverless invocations.
This means:

- The full flow works inside a single warm container (~5 min idle window).
- Sessions created in container A aren't visible in container B.

For production on Vercel, **add a real database** — the recommended path is
[Vercel KV](https://vercel.com/docs/storage/vercel-kv) (Redis). Drop the same
`get/set/del` interface over it and the rest of the app keeps working.

The seed data (Filbert, the demo user, the admin) uses **deterministic IDs**
so cross-container requests on the same path land on the same entity. The
in-memory demo is enough to show the end-to-end flow; swap the store to make
it production-grade.

## Why this is a real business

The B2B version of this exact model (AI → human escalation) is a $5B+ market. Sierra, Decagon, Intercom Fin, Salesforce Agentforce, and Microsoft Copilot Studio all have it. **Consumer/prosumer is wide open.**

The moat is the data flywheel: every interaction makes the matching smarter, which makes sessions more likely to succeed, which attracts more workers, which attracts more AI agent users, which generates more data. Compounding.

## License

Proprietary.
