# JustNewMe — Deploy guide

## Vercel (recommended)

```bash
# First time
vercel link
vercel env add STRIPE_SECRET_KEY
vercel env add STRIPE_WEBHOOK_SECRET
vercel env add JUSTNEWME_PLATFORM_FEE_BPS
vercel env add AUTH_SECRET

# Deploy
vercel --prod
```

### Stripe webhook setup

1. Stripe dashboard → Developers → Webhooks → Add endpoint
2. Endpoint URL: `https://<your-domain>/api/stripe/webhook`
3. Events to send:
   - `payment_intent.canceled`
   - `payment_intent.succeeded`
   - `account.updated`
4. Copy the signing secret → `STRIPE_WEBHOOK_SECRET` env var
5. Re-deploy (`vercel --prod`) so the new env var takes effect

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `STRIPE_SECRET_KEY` | yes | From Stripe dashboard → API keys |
| `STRIPE_WEBHOOK_SECRET` | yes (prod) | From Stripe dashboard → Webhooks |
| `JUSTNEWME_PLATFORM_FEE_BPS` | no (default 1500) | Platform fee in basis points (1500 = 15%) |
| `AUTH_SECRET` | yes (prod) | 32+ char random string for session signing |
| `NEXT_PUBLIC_URL` | yes (prod) | `https://your-domain.com` — used in Stripe redirect URLs |

## Database (when you swap out the in-memory store)

The data layer (`app/lib/data.ts`) exposes a stable interface. To swap in Supabase / Postgres:

1. Implement the same `Users`, `Workers`, `Problems`, `Sessions`, `Messages`, `Events`, `Notifications` exports with Supabase queries
2. Keep the async signatures
3. Replace the import in `app/lib/auth.ts` if needed (it should "just work")
4. Add a `DATABASE_URL` env var
5. Run the migrations in `supabase/migrations/` (TODO when you set this up)

## Production checklist

- [ ] Replace `app/lib/auth.ts` with real auth
- [ ] Swap in-memory store for Supabase
- [ ] Wire email notifications to Resend
- [ ] Add Stripe Identity for worker verification
- [ ] Configure the Stripe webhook
- [ ] Add Sentry for error monitoring
- [ ] Add rate limiting per IP
- [ ] Add a CSP that allows Stripe.js
- [ ] Set up daily GMV / dispute / flag digest email for the admin
- [ ] Publish `@justnewme/mcp-server` to npm and submit to MCP directories
