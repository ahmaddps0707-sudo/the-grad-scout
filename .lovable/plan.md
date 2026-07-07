Enable Lovable's built-in Stripe payments in **test/sandbox mode only** and wire up the Pro subscription checkout. No live-mode claim required — you can test full flows with Stripe test cards.

## What happens

1. **Enable built-in Stripe** — A short form appears for business details. Test environment is provisioned instantly; live mode stays unclaimed until you're ready.
2. **Tax handling** — Set up as tax calculation and collection only (+0.5%), adjustable per transaction later.
3. **Create Pro product** — $10/mo recurring subscription in sandbox.
4. **Wire checkout + webhooks** — Server functions for `create-checkout`, `create-portal`, and a webhook handler at `/api/public/webhooks/stripe` to sync subscription state to `profiles`.
5. **Tier gating & UI** — Enforce free-tier limits (discover runs, AI bullets, tracked programs), add upgrade modal, add subscription section in Settings with Upgrade/Manage buttons, and success/cancel banners on `?upgrade=success|canceled`.

## Technical notes

- Uses `enable_stripe_payments` (seamless, no keys to paste).
- All checkout/portal calls go through `createServerFn` with `requireSupabaseAuth`.
- Webhook is a public route with signature verification, loading `supabaseAdmin` inside the handler.
- Test cards (e.g. `4242 4242 4242 4242`) work end-to-end in sandbox.

Ready to proceed? Confirm and I'll run the enable flow.