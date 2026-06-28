// web/lib/stripePurchases.ts

import "server-only";

import { sql } from "@vercel/postgres";
import type Stripe from "stripe";

import { grantEntitlement, revokeEntitlement } from "@/lib/entitlementOps";
import { EVENT_SOURCES } from "@/lib/vocab";

export type StripePurchaseEntitlement = {
  priceId: string;
  entitlementKey: string;
  scopeId: string | null;
  scopeMeta: Record<string, unknown>;
};

type PurchaseRow = {
  id: string;
  member_id: string;
};

type PurchaseFinancialRow = {
  id: string;
  member_id: string;
  amount_cents: number;
};

type PurchaseEntitlementRow = {
  entitlement_key: string;
  scope_id: string | null;
};

function readObjectField(source: unknown, key: string): unknown {
  if (!source || typeof source !== "object") return null;
  return (source as Record<string, unknown>)[key] ?? null;
}

function readStripeId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();

  if (value && typeof value === "object") {
    const id = readObjectField(value, "id");
    if (typeof id === "string" && id.trim()) return id.trim();
  }

  return null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function paymentRefsFromSession(session: Stripe.Checkout.Session): {
  paymentIntentId: string | null;
  chargeId: string | null;
} {
  const paymentIntent = session.payment_intent as unknown;

  return {
    paymentIntentId: readStripeId(paymentIntent),
    chargeId: readStripeId(readObjectField(paymentIntent, "latest_charge")),
  };
}

function customerIdFromSession(
  session: Stripe.Checkout.Session,
): string | null {
  return readStripeId(session.customer as unknown);
}

function refundRefs(refund: Stripe.Refund): {
  paymentIntentId: string | null;
  chargeId: string | null;
} {
  const source = refund as unknown;

  return {
    paymentIntentId: readStripeId(readObjectField(source, "payment_intent")),
    chargeId: readStripeId(readObjectField(source, "charge")),
  };
}

async function reconcileRefundedPurchaseEntitlements(params: {
  purchaseId: string;
  memberId: string;
  correlationId: string;
}): Promise<void> {
  const rows = await sql<PurchaseEntitlementRow>`
    select entitlement_key, scope_id
    from purchase_entitlements
    where purchase_id = ${params.purchaseId}::uuid
  `;

  for (const row of rows.rows) {
    const stillSupported = await sql`
      select 1
      from purchase_entitlements pe
      join purchases p on p.id = pe.purchase_id
      where p.member_id = ${params.memberId}::uuid
        and p.status in ('paid', 'partially_refunded')
        and pe.entitlement_key = ${row.entitlement_key}
        and coalesce(pe.scope_id, '') = coalesce(${row.scope_id ?? ""}, '')
      limit 1
    `;

    if ((stillSupported.rowCount ?? 0) > 0) continue;

    await revokeEntitlement({
      memberId: params.memberId,
      entitlementKey: row.entitlement_key,
      scopeId: row.scope_id,
      grantSource: "stripe_purchase",
      revokedBy: "system",
      revokeReason: "stripe_refund_succeeded",
      correlationId: params.correlationId,
      eventSource: EVENT_SOURCES.STRIPE,
    });
  }
}

export async function recordPaidStripeCheckoutPurchase(params: {
  session: Stripe.Checkout.Session;
  memberId: string;
  entitlements: StripePurchaseEntitlement[];
  correlationId: string;
}): Promise<{ purchaseId: string }> {
  const { session, memberId, entitlements, correlationId } = params;

  const rawAmountCents = session.amount_total;
  if (
    typeof rawAmountCents !== "number" ||
    !Number.isInteger(rawAmountCents) ||
    rawAmountCents < 0
  ) {
    throw new Error(`Checkout session ${session.id} has no valid amount_total`);
  }

  const amountCents = rawAmountCents;

  const currency = readString(session.currency);
  if (!currency) {
    throw new Error(`Checkout session ${session.id} has no currency`);
  }

  const { paymentIntentId, chargeId } = paymentRefsFromSession(session);
  const customerId = customerIdFromSession(session);

  const metadata = {
    checkout_mode: session.mode ?? null,
    stripe_customer_id: customerId,
    stripe_payment_intent_id: paymentIntentId,
    stripe_charge_id: chargeId,
    price_ids: [...new Set(entitlements.map((row) => row.priceId))],
  };

  const purchase = await sql<PurchaseRow>`
    insert into purchases (
      member_id,
      provider,
      provider_ref,
      amount_cents,
      currency,
      purchased_at,
      metadata,
      status,
      stripe_customer_id,
      stripe_payment_intent_id,
      stripe_charge_id,
      updated_at
    )
    values (
      ${memberId}::uuid,
      'stripe_checkout',
      ${session.id},
      ${amountCents},
      ${currency},
      now(),
      ${JSON.stringify(metadata)}::jsonb,
      'paid',
      ${customerId},
      ${paymentIntentId},
      ${chargeId},
      now()
    )
    on conflict (provider, provider_ref)
    do update set
      stripe_customer_id = coalesce(
        purchases.stripe_customer_id,
        excluded.stripe_customer_id
      ),
      stripe_payment_intent_id = coalesce(
        purchases.stripe_payment_intent_id,
        excluded.stripe_payment_intent_id
      ),
      stripe_charge_id = coalesce(
        purchases.stripe_charge_id,
        excluded.stripe_charge_id
      ),
      metadata = purchases.metadata || excluded.metadata,
      updated_at = now()
    returning id, member_id
  `;

  const purchaseRow = purchase.rows[0];
  if (!purchaseRow) {
    throw new Error(
      `Could not create or retrieve purchase for Checkout session ${session.id}`,
    );
  }

  if (purchaseRow.member_id !== memberId) {
    throw new Error(
      `Checkout session ${session.id} is already linked to another member`,
    );
  }

  for (const row of entitlements) {
    await sql`
      insert into purchase_entitlements (
        purchase_id,
        entitlement_key,
        scope_id,
        scope_meta
      )
      select
        ${purchaseRow.id}::uuid,
        ${row.entitlementKey},
        ${row.scopeId},
        ${JSON.stringify(row.scopeMeta)}::jsonb
      where not exists (
        select 1
        from purchase_entitlements pe
        where pe.purchase_id = ${purchaseRow.id}::uuid
          and pe.entitlement_key = ${row.entitlementKey}
          and coalesce(pe.scope_id, '') = coalesce(${row.scopeId ?? ""}, '')
      )
    `;

    await grantEntitlement({
      memberId,
      entitlementKey: row.entitlementKey,
      scopeId: row.scopeId,
      scopeMeta: row.scopeMeta,
      grantedBy: "system",
      grantReason: "stripe_checkout_completed",
      grantSource: "stripe_purchase",
      grantSourceRef: session.id,
      expiresAt: null,
      correlationId,
      eventSource: EVENT_SOURCES.STRIPE,
    });
  }

  return { purchaseId: purchaseRow.id };
}

export async function recordStripeRefund(params: {
  refund: Stripe.Refund;
  correlationId: string;
}): Promise<{
  matched: boolean;
  purchaseId: string | null;
  fullyRefunded: boolean;
}> {
  const { refund, correlationId } = params;

  const refundId = readString(refund.id);
  if (!refundId) throw new Error("Stripe refund has no id");

  const { paymentIntentId, chargeId } = refundRefs(refund);
  if (!paymentIntentId && !chargeId) {
    return {
      matched: false,
      purchaseId: null,
      fullyRefunded: false,
    };
  }

  const purchase = await sql<PurchaseFinancialRow>`
    select id, member_id, amount_cents
    from purchases
    where stripe_payment_intent_id = ${paymentIntentId}
       or stripe_charge_id = ${chargeId}
    order by purchased_at desc
    limit 1
  `;

  const purchaseRow = purchase.rows[0];
  if (!purchaseRow) {
    return {
      matched: false,
      purchaseId: null,
      fullyRefunded: false,
    };
  }

  const refundSource = refund as unknown;
  const rawAmountCents = readObjectField(refundSource, "amount");
  const currency = readString(readObjectField(refundSource, "currency"));
  const status = readString(readObjectField(refundSource, "status"));
  const reason = readString(readObjectField(refundSource, "reason"));

  if (
    typeof rawAmountCents !== "number" ||
    !Number.isInteger(rawAmountCents) ||
    rawAmountCents < 0 ||
    !currency ||
    !status
  ) {
    throw new Error(`Stripe refund ${refundId} has incomplete financial data`);
  }

  const amountCents = rawAmountCents;

  await sql`
    insert into purchase_refunds (
      purchase_id,
      stripe_refund_id,
      amount_cents,
      currency,
      status,
      reason,
      metadata,
      updated_at
    )
    values (
      ${purchaseRow.id}::uuid,
      ${refundId},
      ${amountCents},
      ${currency},
      ${status},
      ${reason},
      ${JSON.stringify({
        stripe_payment_intent_id: paymentIntentId,
        stripe_charge_id: chargeId,
      })}::jsonb,
      now()
    )
    on conflict (stripe_refund_id)
    do update set
      amount_cents = excluded.amount_cents,
      currency = excluded.currency,
      status = excluded.status,
      reason = excluded.reason,
      metadata = excluded.metadata,
      updated_at = now()
  `;

  const totals = await sql<{ refunded_total: number | string }>`
    select coalesce(
      sum(amount_cents) filter (where status = 'succeeded'),
      0
    ) as refunded_total
    from purchase_refunds
    where purchase_id = ${purchaseRow.id}::uuid
  `;

  const refundedAmountCents = Number(totals.rows[0]?.refunded_total ?? 0);

  if (!Number.isFinite(refundedAmountCents) || refundedAmountCents < 0) {
    throw new Error(
      `Could not calculate refund total for purchase ${purchaseRow.id}`,
    );
  }

  const fullyRefunded = refundedAmountCents >= purchaseRow.amount_cents;
  const purchaseStatus = fullyRefunded
    ? "refunded"
    : refundedAmountCents > 0
      ? "partially_refunded"
      : "paid";

  await sql`
    update purchases
    set
      refunded_amount_cents = ${refundedAmountCents},
      status = ${purchaseStatus},
      refunded_at = case
        when ${fullyRefunded} then coalesce(refunded_at, now())
        else null
      end,
      updated_at = now()
    where id = ${purchaseRow.id}::uuid
  `;

  if (fullyRefunded) {
    await reconcileRefundedPurchaseEntitlements({
      purchaseId: purchaseRow.id,
      memberId: purchaseRow.member_id,
      correlationId,
    });
  }

  return {
    matched: true,
    purchaseId: purchaseRow.id,
    fullyRefunded,
  };
}
