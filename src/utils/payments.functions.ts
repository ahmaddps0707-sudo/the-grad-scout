import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { type StripeEnv, createStripeClient, getStripeErrorMessage } from "@/lib/stripe.server";

type CheckoutSessionResult = { clientSecret: string } | { error: string };
type PortalSessionResult = { url: string } | { error: string };

async function resolveOrCreateCustomer(
  stripe: ReturnType<typeof createStripeClient>,
  options: { email?: string; userId?: string },
): Promise<string> {
  if (options.userId && !/^[a-zA-Z0-9_-]+$/.test(options.userId)) {
    throw new Error("Invalid userId");
  }
  if (options.userId) {
    const found = await stripe.customers.search({
      query: `metadata['userId']:'${options.userId}'`,
      limit: 1,
    });
    if (found.data.length) return found.data[0].id;
  }
  if (options.email) {
    const existing = await stripe.customers.list({ email: options.email, limit: 1 });
    if (existing.data.length) {
      const customer = existing.data[0];
      if (options.userId && customer.metadata?.userId !== options.userId) {
        await stripe.customers.update(customer.id, {
          metadata: { ...customer.metadata, userId: options.userId },
        });
      }
      return customer.id;
    }
  }
  const created = await stripe.customers.create({
    ...(options.email && { email: options.email }),
    ...(options.userId && { metadata: { userId: options.userId } }),
  });
  return created.id;
}

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    priceId: string;
    returnUrl: string;
    environment: StripeEnv;
    trialDays?: number;
    promoCode?: string;
  }) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(data.priceId)) throw new Error("Invalid priceId");
    return data;
  })
  .handler(async ({ data, context }): Promise<CheckoutSessionResult> => {
    try {
      const stripe = createStripeClient(data.environment);
      const { userId, supabase } = context;
      const { data: { user } } = await supabase.auth.getUser();
      const email = user?.email ?? undefined;

      const prices = await stripe.prices.list({ lookup_keys: [data.priceId] });
      if (!prices.data.length) throw new Error("Price not found");
      const stripePrice = prices.data[0];
      const isRecurring = stripePrice.type === "recurring";

      const customerId = await resolveOrCreateCustomer(stripe, { email, userId });

      // Resolve + validate promo code (expiry, cap, per-user single-use)
      let discounts: { coupon: string }[] | undefined;
      let redeemedPromoId: string | undefined;
      if (data.promoCode) {
        const code = data.promoCode.trim().toUpperCase();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: promo } = await supabaseAdmin
          .from("promo_codes")
          .select("id, stripe_coupon_id, active, expires_at, max_redemptions, times_redeemed")
          .eq("code", code)
          .maybeSingle();
        if (!promo || !promo.active || !promo.stripe_coupon_id) {
          return { error: "Invalid or inactive promo code" };
        }
        if (promo.expires_at && new Date(promo.expires_at).getTime() < Date.now()) {
          return { error: "This promo code has expired" };
        }
        if (promo.max_redemptions != null && (promo.times_redeemed ?? 0) >= promo.max_redemptions) {
          return { error: "This promo code has reached its redemption limit" };
        }
        const { data: prior } = await supabase
          .from("user_promo_usage")
          .select("id")
          .eq("user_id", userId)
          .eq("promo_code_id", promo.id)
          .maybeSingle();
        if (prior) {
          return { error: "You have already used this promo code" };
        }
        discounts = [{ coupon: promo.stripe_coupon_id }];
        redeemedPromoId = promo.id;
      }

      const session = await stripe.checkout.sessions.create({
        line_items: [{ price: stripePrice.id, quantity: 1 }],
        mode: isRecurring ? "subscription" : "payment",
        ui_mode: "embedded_page",
        return_url: data.returnUrl,
        customer: customerId,
        metadata: { userId, ...(redeemedPromoId && { promoCodeId: redeemedPromoId }) },
        ...(isRecurring && {
          subscription_data: {
            metadata: { userId, ...(redeemedPromoId && { promoCodeId: redeemedPromoId }) },
            ...(data.trialDays && data.trialDays > 0 && { trial_period_days: data.trialDays }),
            // Stack discount with the trial so it applies to the first paid invoice.
            ...(discounts && { discounts }),
          },
        }),
        // For one-off (non-recurring) purchases, apply the discount at the session level.
        ...(!isRecurring && discounts && { discounts }),
      } as any);

      // Record redemption locally so subsequent attempts are blocked.
      // Uses the authenticated client (RLS-safe: we already resolved userId from the session).
      if (redeemedPromoId) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("user_promo_usage").insert({
          user_id: userId,
          promo_code_id: redeemedPromoId,
        });
        const { data: cur } = await supabaseAdmin
          .from("promo_codes").select("times_redeemed").eq("id", redeemedPromoId).single();
        await supabaseAdmin.from("promo_codes")
          .update({ times_redeemed: ((cur?.times_redeemed as number | null) ?? 0) + 1 })
          .eq("id", redeemedPromoId);
      }

      return { clientSecret: session.client_secret ?? "" };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

export const createPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { returnUrl?: string; environment: StripeEnv }) => data)
  .handler(async ({ data, context }): Promise<PortalSessionResult> => {
    try {
      const { supabase, userId } = context;
      const { data: prof } = await supabase
        .from("profiles")
        .select("stripe_customer_id")
        .eq("id", userId)
        .maybeSingle();
      if (!prof?.stripe_customer_id) return { error: "No billing account found" };
      const stripe = createStripeClient(data.environment);
      const portal = await stripe.billingPortal.sessions.create({
        customer: prof.stripe_customer_id,
        ...(data.returnUrl && { return_url: data.returnUrl }),
      });
      return { url: portal.url };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });