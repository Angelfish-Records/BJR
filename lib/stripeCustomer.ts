import "server-only";
import { sql } from "@vercel/postgres";
import Stripe from "stripe";

function must(v: string, name: string) {
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

type MemberRow = {
  id: string;
  stripe_customer_id: string | null;
};

export async function ensureStripeCustomerForClerkUser(args: {
  stripe: Stripe;
  clerkUserId: string;
  email: string; // should already be normalized + non-empty
}): Promise<{ memberId: string; customerId: string }> {
  const { stripe, clerkUserId, email } = args;

  const clerkId = (clerkUserId ?? "").trim();
  if (!clerkId) throw new Error("Missing clerkUserId");

  const em = (email ?? "").trim();
  if (!em) throw new Error("Missing email");

  // 1) Load member + existing stripe_customer_id
  const r1 = await sql`
    select id, stripe_customer_id
    from members
    where clerk_user_id = ${clerkId}
    limit 1
  `;
  const m1 = r1.rows[0] as MemberRow | undefined;
  if (!m1?.id) throw new Error("No member row for clerk user");

  if (m1.stripe_customer_id) {
    return { memberId: m1.id, customerId: m1.stripe_customer_id };
  }

  // 2) Create Stripe customer (we’ll try to attach it; DB is the source of truth)
  const created = await stripe.customers.create({
    email: em,
    metadata: { clerk_user_id: clerkId, source: "first_checkout_intent" },
  });
  const newCid = must(created.id, "stripe_customer.id");

  // 3) Compare-and-set: only write if still null (handles races)
  const r2 = await sql`
    update members
    set stripe_customer_id = ${newCid}
    where id = ${m1.id}::uuid
      and stripe_customer_id is null
    returning stripe_customer_id
  `;

  if ((r2.rowCount ?? 0) > 0) {
    return { memberId: m1.id, customerId: newCid };
  }

  // 4) If we lost the race, re-read the winner and use that
  const r3 = await sql`
    select stripe_customer_id
    from members
    where id = ${m1.id}::uuid
    limit 1
  `;
  const winner =
    (r3.rows[0]?.stripe_customer_id as string | null | undefined) ?? null;

  if (winner) return { memberId: m1.id, customerId: winner };

  // Extremely unlikely, but don’t silently proceed.
  throw new Error("Failed to persist stripe_customer_id");
}