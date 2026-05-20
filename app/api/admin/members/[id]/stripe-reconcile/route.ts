import "server-only";

import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import Stripe from "stripe";

import { requireAdminMemberId } from "@/lib/adminAuth";
import { assertStripeSecretKey } from "@/lib/stripeEnv";
import { reconcileStripeSubscription } from "@/lib/stripeSubscriptions";

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminMemberId();

    const { id } = await ctx.params;
    if (!looksLikeUuid(id)) {
      return NextResponse.json(
        { ok: false, error: "Bad member id" },
        { status: 400 },
      );
    }

    const member = await sql<{
      id: string;
      email: string;
      stripe_customer_id: string | null;
    }>`
      select id, email, stripe_customer_id
      from members
      where id = ${id}::uuid
      limit 1
    `;

    const memberRow = member.rows[0] ?? null;
    const customerId = memberRow?.stripe_customer_id ?? null;

    if (!memberRow || !customerId) {
      return NextResponse.json(
        { ok: false, error: "Member has no Stripe customer id" },
        { status: 400 },
      );
    }

    const stripe = new Stripe(
      assertStripeSecretKey(process.env.STRIPE_SECRET_KEY ?? ""),
    );

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
    });

    const reconciled: Array<{
      subscriptionId: string;
      status: string;
      itemCount: number;
    }> = [];

    for (const subscription of subscriptions.data) {
      await reconcileStripeSubscription({ stripe, subscription });

      reconciled.push({
        subscriptionId: subscription.id,
        status: subscription.status,
        itemCount: subscription.items.data.length,
      });
    }

    return NextResponse.json({
      ok: true,
      memberId: id,
      stripeCustomerId: customerId,
      reconciled,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "error";
    return NextResponse.json({ ok: false, error: message }, { status: 401 });
  }
}