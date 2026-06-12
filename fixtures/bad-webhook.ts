// FIXTURE — intentionally buggy. Seeded for `penny review` to catch. Do NOT "fix" this file;
// it is the known-catch for the 21-pitfall scanner (B4). It carries the P-04 raw-body footgun
// (and a couple of sibling tells) so the scanner has a deterministic finding to report.

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");

export async function POST(req: Request): Promise<Response> {
  // BUG (P-04 / S-03): parses + reserializes the body BEFORE verifying the signature, so the
  // HMAC no longer byte-matches what Stripe signed and constructEvent will 400.
  const body = await req.json();
  const sig = req.headers.get("stripe-signature") ?? "";
  const event = stripe.webhooks.constructEvent(
    JSON.stringify(body),
    sig,
    process.env.STRIPE_WEBHOOK_SECRET ?? "",
  );

  // BUG (P-14 / S-15): entitlement keyed off the raw subscription.status string.
  if (event.type === "customer.subscription.updated") {
    const sub = event.data.object as Stripe.Subscription;
    if (sub.status === "active") {
      grantAccess(sub.customer as string);
    }
  }

  // BUG (P-08): the dead usage-records API — removed since Basil; metered needs a Meter.
  // @ts-expect-error — intentionally calling the removed API to seed the scanner.
  await stripe.subscriptionItems.createUsageRecord("si_x", { quantity: 1 });

  return new Response("ok", { status: 200 });
}

function grantAccess(_customerId: string): void {
  // ... grants the customer access (the side-effect) ...
}
