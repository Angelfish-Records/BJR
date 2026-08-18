// web/lib/stripeSubscriptions.ts
import "server-only";
import { sql } from "@vercel/postgres";
import Stripe from "stripe";
import { ensureMemberByEmail, normalizeEmail } from "./members";

type PriceEntitlementRow = {
  price_id: string;
  entitlement_key: string;
  scope_id: string | null;
  scope_meta: unknown;
};

type SubscriptionItem = Stripe.Subscription["items"]["data"][number];

function toDateFromUnixSeconds(s: number | null | undefined): Date | null {
  if (!s || s <= 0) return null;
  return new Date(s * 1000);
}

function keyOf(entitlementKey: string, scopeId: string | null): string {
  return `${entitlementKey}::${scopeId ?? ""}`;
}

async function attachStripeCustomerId(
  memberId: string,
  customerId: string,
): Promise<void> {
  if (!memberId || !customerId) return;

  const existing = await sql`
    select stripe_customer_id
    from members
    where id = ${memberId}::uuid
    limit 1
  `;

  const current =
    (existing.rows[0]?.stripe_customer_id as string | null | undefined) ?? null;

  if (current && current !== customerId) {
    throw new Error(
      `Stripe customer conflict for member ${memberId}: existing=${current}, incoming=${customerId}`,
    );
  }

  await sql`
    update members
    set stripe_customer_id = ${customerId}
    where id = ${memberId}::uuid
      and stripe_customer_id is null
  `;
}

/**
 * Reconcile entitlements for a Stripe subscription into entitlement_grants.
 *
 * grant_source = 'stripe_subscription'
 * grant_source_ref = subscription.id
 *
 * We intentionally DO NOT use ON CONFLICT, because your schema may not (and need not)
 * have the exact unique constraints Postgres requires for inference.
 */

async function resolveSubscriptionMemberId(
  stripe: Stripe,
  customerId: string,
): Promise<string | null> {
  const memberByCustomer = await sql`
    select id
    from members
    where stripe_customer_id = ${customerId}
    limit 1
  `;
  const existingMemberId =
    (memberByCustomer.rows[0]?.id as string | undefined) ?? null;

  if (existingMemberId) {
    return existingMemberId;
  }

  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) return null;

  const email = normalizeEmail(customer.email ?? "");
  if (!email) return null;

  const ensured = await ensureMemberByEmail({
    email,
    source: "stripe",
    sourceDetail: { stripe_customer_id: customerId },
  });

  return ensured.id;
}

function subscriptionPriceIds(items: SubscriptionItem[]): string[] {
  return items
    .map((item) => item.price?.id)
    .filter((priceId): priceId is string => Boolean(priceId));
}

function subscriptionExpiresImmediately(status: string): boolean {
  return (
    status === "canceled" ||
    status === "incomplete_expired" ||
    status === "unpaid"
  );
}

function periodEndByPriceId(
  items: SubscriptionItem[],
): Map<string, Date | null> {
  const result = new Map<string, Date | null>();

  for (const item of items) {
    const priceId = item.price?.id;
    if (!priceId) continue;

    result.set(
      priceId,
      toDateFromUnixSeconds(item.current_period_end ?? null),
    );
  }

  return result;
}

async function expireAllSubscriptionGrants(
  memberId: string,
  subscriptionId: string,
): Promise<void> {
  await sql`
      update entitlement_grants
      set expires_at = now()
      where member_id = ${memberId}::uuid
        and grant_source = 'stripe_subscription'
        and grant_source_ref = ${subscriptionId}
        and revoked_at is null
        and (expires_at is null or expires_at > now())
    `;
}

async function loadDesiredSubscriptionEntitlements(
  priceIds: string[],
  subscriptionId: string,
): Promise<PriceEntitlementRow[]> {
  const mapped = await sql`
    select price_id, entitlement_key, scope_id, scope_meta
    from stripe_price_entitlements
    where price_id in (
      select jsonb_array_elements_text(${JSON.stringify(priceIds)}::jsonb)
    )
  `;
  const desiredRows = mapped.rows as PriceEntitlementRow[];
  const mappedPriceIds = new Set(desiredRows.map((row) => row.price_id));
  const unmappedPriceIds = priceIds.filter(
    (priceId) => !mappedPriceIds.has(priceId),
  );

  if (unmappedPriceIds.length > 0) {
    throw new Error(
      `Stripe subscription ${subscriptionId} has unmapped price IDs: ${unmappedPriceIds.join(", ")}`,
    );
  }

  return desiredRows;
}

async function insertDesiredSubscriptionGrants(params: {
  memberId: string;
  subscriptionId: string;
  desiredRows: PriceEntitlementRow[];
  endByPriceId: Map<string, Date | null>;
  expireNow: boolean;
}): Promise<void> {
  const {
    memberId,
    subscriptionId,
    desiredRows,
    endByPriceId,
    expireNow,
  } = params;

  for (const row of desiredRows) {
    const expiry = expireNow
      ? new Date()
      : (endByPriceId.get(row.price_id) ?? null);

    await sql`
      insert into entitlement_grants (
        member_id,
        entitlement_key,
        scope_id,
        scope_meta,
        granted_by,
        grant_reason,
        grant_source,
        grant_source_ref,
        expires_at
      )
      select
        ${memberId}::uuid,
        ${row.entitlement_key},
        ${row.scope_id},
        ${JSON.stringify(row.scope_meta ?? {})}::jsonb,
        'system',
        'stripe_subscription_reconciled',
        'stripe_subscription',
        ${subscriptionId},
        ${expiry ? expiry.toISOString() : null}::timestamptz
      where not exists (
        select 1
        from entitlement_grants eg
        where eg.member_id = ${memberId}::uuid
          and eg.entitlement_key = ${row.entitlement_key}
          and coalesce(eg.scope_id,'') = coalesce(${row.scope_id ?? ""},'')
          and eg.grant_source = 'stripe_subscription'
          and eg.grant_source_ref = ${subscriptionId}
          and eg.revoked_at is null
          and (eg.expires_at is null or eg.expires_at > now())
      )
    `;
  }
}

async function expireStaleSubscriptionGrants(params: {
  memberId: string;
  subscriptionId: string;
  desiredKeys: Set<string>;
}): Promise<void> {
  const { memberId, subscriptionId, desiredKeys } = params;

  const activeGrantsForSub = await sql`
    select entitlement_key, scope_id
    from entitlement_grants
    where member_id = ${memberId}::uuid
      and grant_source = 'stripe_subscription'
      and grant_source_ref = ${subscriptionId}
      and revoked_at is null
      and (expires_at is null or expires_at > now())
  `;

  for (const row of activeGrantsForSub.rows as Array<{
    entitlement_key: string;
    scope_id: string | null;
  }>) {
    const key = keyOf(row.entitlement_key, row.scope_id);
    if (desiredKeys.has(key)) continue;

    await sql`
      update entitlement_grants
      set expires_at = now()
      where member_id = ${memberId}::uuid
        and entitlement_key = ${row.entitlement_key}
        and coalesce(scope_id,'') = coalesce(${row.scope_id ?? ""},'')
        and grant_source = 'stripe_subscription'
        and grant_source_ref = ${subscriptionId}
        and revoked_at is null
        and (expires_at is null or expires_at > now())
    `;
  }
}

export async function reconcileStripeSubscription(params: {
  stripe: Stripe;
  subscription: Stripe.Subscription;
}): Promise<void> {
  const { stripe, subscription: sub } = params;

  const customerId =
    typeof sub.customer === "string" ? sub.customer : (sub.customer?.id ?? "");
  if (!customerId) return;

  const memberId = await resolveSubscriptionMemberId(stripe, customerId);
  if (!memberId) return;

  await attachStripeCustomerId(memberId, customerId);

  const items = sub.items?.data ?? [];
  const priceIds = subscriptionPriceIds(items);
  const expireNow = subscriptionExpiresImmediately(
    (sub.status ?? "").toString(),
  );

  if (priceIds.length === 0) {
    await expireAllSubscriptionGrants(memberId, sub.id);
    return;
  }

  const desiredRows = await loadDesiredSubscriptionEntitlements(
    priceIds,
    sub.id,
  );

  if (desiredRows.length === 0) {
    await expireAllSubscriptionGrants(memberId, sub.id);
    return;
  }

  const endByPriceId = periodEndByPriceId(items);
  await insertDesiredSubscriptionGrants({
    memberId,
    subscriptionId: sub.id,
    desiredRows,
    endByPriceId,
    expireNow,
  });

  const desiredKeys = new Set(
    desiredRows.map((row) => keyOf(row.entitlement_key, row.scope_id)),
  );

  await expireStaleSubscriptionGrants({
    memberId,
    subscriptionId: sub.id,
    desiredKeys,
  });
}
