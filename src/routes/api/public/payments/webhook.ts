import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";

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

async function upsertSubscriptionOnProfile(subscription: any) {
  const userId = subscription.metadata?.userId;
  if (!userId) {
    console.error("[webhook] No userId in subscription metadata", subscription.id);
    return;
  }
  const item = subscription.items?.data?.[0];
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;

  // Business logic: paid/active tier maps to 'paid'; anything else -> 'free' on the app side,
  // but keep subscription_status as-is so UI can show trialing / past_due / cancelled banners.
  const status = subscription.status as string;
  const grants = status === "active" || status === "trialing" || status === "past_due";
  const tier = grants ? "paid" : "free";

  // If cancelled but still within period, keep access until period end.
  const activeUntilPeriodEnd = status === "canceled" && periodEnd && periodEnd * 1000 > Date.now();
  const finalTier = activeUntilPeriodEnd ? "paid" : tier;
  const finalStatus = activeUntilPeriodEnd ? "canceled" : status;

  await getSupabase()
    .from("profiles")
    .update({
      subscription_tier: finalTier,
      subscription_status: finalStatus,
      stripe_customer_id: subscription.customer,
      stripe_subscription_id: subscription.id,
      subscription_start_date: isoFromUnix(subscription.start_date ?? periodStart),
      subscription_current_period_end: isoFromUnix(periodEnd),
      cancel_at_period_end: subscription.cancel_at_period_end ?? false,
      trial_end_date: isoFromUnix(subscription.trial_end),
      usage_reset_at: isoFromUnix(periodEnd) ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
}

async function handleSubscriptionDeleted(subscription: any) {
  const userId = subscription.metadata?.userId;
  if (!userId) return;
  await getSupabase()
    .from("profiles")
    .update({
      subscription_tier: "free",
      subscription_status: "canceled",
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
}

async function handleInvoicePaid(invoice: any) {
  // Prefer subscription.metadata.userId; fallback to customer.metadata.userId
  let userId: string | undefined = invoice.subscription_details?.metadata?.userId
    ?? invoice.metadata?.userId;
  if (!userId && invoice.customer) {
    const { data } = await getSupabase()
      .from("profiles")
      .select("id")
      .eq("stripe_customer_id", invoice.customer as string)
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

  // Mark payment method attached
  await getSupabase()
    .from("profiles")
    .update({ payment_method_attached: true })
    .eq("id", userId);
}

async function handleInvoicePaymentFailed(invoice: any) {
  const userId = invoice.subscription_details?.metadata?.userId
    ?? invoice.metadata?.userId;
  if (!userId) return;
  await getSupabase()
    .from("profiles")
    .update({ subscription_status: "past_due", updated_at: new Date().toISOString() })
    .eq("id", userId);
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await upsertSubscriptionOnProfile(event.data.object);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object);
      break;
    case "invoice.paid":
    case "invoice.payment_succeeded":
      await handleInvoicePaid(event.data.object);
      break;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event.data.object);
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