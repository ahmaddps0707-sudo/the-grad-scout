import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";
import { subColumns } from "@/lib/subscription";

// Kept in sync with FREE_LIMITS.discover_runs in src/lib/limits.ts.
// Duplicated as a literal so this route file has no client-tree imports.
const FREE_DISCOVER_LIMIT = 3;

let _supabase: ReturnType<typeof createClient<Database>> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _supabase;
}

function isoFromUnix(seconds: number | null | undefined): string | null {
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

async function upsertSubscriptionOnProfile(subscription: any, env: StripeEnv) {
  const userId = subscription.metadata?.userId;
  if (!userId) {
    console.error("[webhook] No userId in subscription metadata", subscription.id);
    return;
  }
  const cols = subColumns(env);
  const item = subscription.items?.data?.[0];
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;

  const status = subscription.status as string;
  const grants = status === "active" || status === "trialing" || status === "past_due";
  const tier = grants ? "paid" : "free";
  const activeUntilPeriodEnd = status === "canceled" && periodEnd && periodEnd * 1000 > Date.now();
  const finalTier = activeUntilPeriodEnd ? "paid" : tier;
  const finalStatus = activeUntilPeriodEnd ? "canceled" : status;

  const supa = getSupabase();
  const { data: existing } = await supa
    .from("profiles")
    .select(cols.periodEnd)
    .eq("id", userId)
    .maybeSingle();
  const prevEndRaw = (existing as any)?.[cols.periodEnd];
  const prevEnd = prevEndRaw ? new Date(prevEndRaw as string).getTime() : 0;
  const newEnd = periodEnd ? periodEnd * 1000 : 0;
  const isRenewal = newEnd > 0 && prevEnd > 0 && newEnd > prevEnd;

  const update: Record<string, unknown> = {
    [cols.tier]: finalTier,
    [cols.status]: finalStatus,
    [cols.customerId]: subscription.customer,
    [cols.subscriptionId]: subscription.id,
    [cols.startDate]: isoFromUnix(subscription.start_date ?? periodStart),
    [cols.periodEnd]: isoFromUnix(periodEnd),
    [cols.cancelAtEnd]: subscription.cancel_at_period_end ?? false,
    [cols.trialEnd]: isoFromUnix(subscription.trial_end),
    [cols.resetAt]: isoFromUnix(periodEnd) ?? new Date().toISOString(),
    // Any paid subscription burns the one-time trial for this env, so a
    // cancel + re-subscribe cannot re-trigger the 7-day trial.
    [cols.trialUsed]: true,
    updated_at: new Date().toISOString(),
  };
  if (isRenewal) {
    update[cols.discoverUsed] = 0;
    update[cols.aiUsed] = 0;
  }
  await supa.from("profiles").update(update).eq("id", userId);
}

async function handleSubscriptionDeleted(subscription: any, env: StripeEnv) {
  const userId = subscription.metadata?.userId;
  if (!userId) return;
  const cols = subColumns(env);
  const supa = getSupabase();
  // Cap the metered counter at the free limit so a downgraded user isn't
  // instantly locked out of Discover with a stale paid-tier count.
  const { data: cur } = await supa
    .from("profiles")
    .select(cols.discoverUsed)
    .eq("id", userId)
    .maybeSingle();
  const currentUsed = Number((cur as any)?.[cols.discoverUsed] ?? 0);
  const cappedUsed = Math.min(currentUsed, FREE_DISCOVER_LIMIT);
  const update: Record<string, unknown> = {
    [cols.tier]: "free",
    [cols.status]: "canceled",
    [cols.cancelAtEnd]: false,
    [cols.discoverUsed]: cappedUsed,
    updated_at: new Date().toISOString(),
  };
  await supa.from("profiles").update(update).eq("id", userId);
}

async function handleInvoicePaid(invoice: any, env: StripeEnv) {
  const cols = subColumns(env);
  let userId: string | undefined = invoice.subscription_details?.metadata?.userId
    ?? invoice.metadata?.userId;
  if (!userId && invoice.customer) {
    const { data } = await getSupabase()
      .from("profiles")
      .select("id")
      .eq(cols.customerId, invoice.customer as string)
      .maybeSingle();
    userId = (data?.id as string | undefined) ?? undefined;
  }
  if (!userId) return;

  await getSupabase().from("payment_history").upsert(
    {
      user_id: userId,
      stripe_invoice_id: invoice.id,
      amount_cents: invoice.amount_paid ?? 0,
      currency: invoice.currency ?? "usd",
      status: invoice.status ?? "paid",
      hosted_invoice_url: invoice.hosted_invoice_url ?? null,
      invoice_pdf: invoice.invoice_pdf ?? null,
      paid_at: isoFromUnix(invoice.status_transitions?.paid_at ?? invoice.created),
    },
    { onConflict: "stripe_invoice_id" },
  );
}

async function handleInvoicePaymentFailed(invoice: any, env: StripeEnv) {
  const userId = invoice.subscription_details?.metadata?.userId
    ?? invoice.metadata?.userId;
  if (!userId) return;
  const cols = subColumns(env);
  await getSupabase()
    .from("profiles")
    .update({ [cols.status]: "past_due", updated_at: new Date().toISOString() })
    .eq("id", userId);
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await upsertSubscriptionOnProfile(event.data.object, env);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object, env);
      break;
    case "invoice.paid":
    case "invoice.payment_succeeded":
      await handleInvoicePaid(event.data.object, env);
      break;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event.data.object, env);
      break;
    default:
      console.log("[webhook] Unhandled:", event.type);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          console.error("[webhook] Invalid env:", rawEnv);
          return Response.json({ received: true, ignored: "invalid env" });
        }
        try {
          await handleWebhook(request, rawEnv);
          return Response.json({ received: true });
        } catch (e) {
          console.error("[webhook] error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});