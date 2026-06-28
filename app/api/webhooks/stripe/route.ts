// web/app/api/webhooks/stripe/route.ts
import "server-only";
import React from "react";
import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import Stripe from "stripe";
import crypto from "crypto";

import { ensureMemberByEmail, normalizeEmail } from "../../../../lib/members";
import { grantEntitlement } from "../../../../lib/entitlementOps";
import { reconcileStripeSubscription } from "../../../../lib/stripeSubscriptions";
import {
  recordPaidStripeCheckoutPurchase,
  recordStripeRefund,
} from "@/lib/stripePurchases";
import { Resend } from "resend";
import { GiftCreatedEmail } from "@/emails";
import { getAlbumEmailMetaBySlug } from "@/lib/albums";
import { EVENT_SOURCES } from "@/lib/vocab";
import { assertStripeSecretKey } from "@/lib/stripeEnv";

export const runtime = "nodejs";

type PriceEntitlementRow = {
  price_id: string;
  entitlement_key: string;
  scope_id: string | null;
  scope_meta: unknown;
};

function safeErrMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

const WEBHOOK_PROCESSING_LEASE_SECONDS = 120;

type WebhookClaim = "claimed" | "handled" | "processing";

async function claimStripeWebhookEvent(params: {
  eventId: string;
  eventType: string;
  refs: {
    stripeObjectId: string | null;
    stripeCustomerId: string | null;
    checkoutSessionId: string | null;
    subscriptionId: string | null;
  };
}): Promise<WebhookClaim> {
  const { eventId, eventType, refs } = params;

  const claimed = await sql`
    insert into stripe_webhook_events (
      event_id,
      type,
      stripe_object_id,
      stripe_customer_id,
      checkout_session_id,
      subscription_id,
      processing_started_at,
      processing_attempts,
      last_attempt_at
    )
    values (
      ${eventId},
      ${eventType},
      ${refs.stripeObjectId},
      ${refs.stripeCustomerId},
      ${refs.checkoutSessionId},
      ${refs.subscriptionId},
      now(),
      1,
      now()
    )
    on conflict (event_id)
    do update set
      type = excluded.type,
      stripe_object_id = coalesce(
        stripe_webhook_events.stripe_object_id,
        excluded.stripe_object_id
      ),
      stripe_customer_id = coalesce(
        stripe_webhook_events.stripe_customer_id,
        excluded.stripe_customer_id
      ),
      checkout_session_id = coalesce(
        stripe_webhook_events.checkout_session_id,
        excluded.checkout_session_id
      ),
      subscription_id = coalesce(
        stripe_webhook_events.subscription_id,
        excluded.subscription_id
      ),
      processing_started_at = now(),
      processing_attempts = stripe_webhook_events.processing_attempts + 1,
      last_attempt_at = now()
    where stripe_webhook_events.handled_at is null
      and (
        stripe_webhook_events.processing_started_at is null
        or stripe_webhook_events.processing_started_at <
          now() - (${WEBHOOK_PROCESSING_LEASE_SECONDS}::int * interval '1 second')
      )
    returning event_id
  `;

  if ((claimed.rowCount ?? 0) > 0) return "claimed";

  const existing = await sql<{
    handled_at: Date | null;
  }>`
    select handled_at
    from stripe_webhook_events
    where event_id = ${eventId}
    limit 1
  `;

  return existing.rows[0]?.handled_at ? "handled" : "processing";
}

async function recordStripeWebhookHandled(eventId: string) {
  await sql`
    update stripe_webhook_events
    set
      handled_at = coalesce(handled_at, now()),
      processing_started_at = null
    where event_id = ${eventId}
  `;
}

async function recordStripeWebhookFailure(params: {
  eventId: string;
  message: string;
}) {
  await sql`
    update stripe_webhook_events
    set
      handler_error = ${params.message},
      handler_error_at = now(),
      processing_started_at = null
    where event_id = ${params.eventId}
      and handled_at is null
  `;
}

function must(v: string | undefined, name: string) {
  const s = (v ?? "").trim();
  if (!s) throw new Error(`Missing ${name}`);
  return s;
}

function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function readObjectField(source: unknown, key: string): unknown {
  if (!source || typeof source !== "object") return null;
  return (source as Record<string, unknown>)[key] ?? null;
}

function readStripeId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();

  if (value && typeof value === "object") {
    const id = (value as Record<string, unknown>).id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }

  return null;
}

function refsFromStripeEvent(event: Stripe.Event): {
  stripeObjectId: string | null;
  stripeCustomerId: string | null;
  checkoutSessionId: string | null;
  subscriptionId: string | null;
} {
  const object = event.data.object as unknown;

  const objectId = readStripeId(readObjectField(object, "id"));
  const customerId = readStripeId(readObjectField(object, "customer"));

  const subscriptionId = event.type.startsWith("customer.subscription.")
    ? objectId
    : readStripeId(readObjectField(object, "subscription"));

  const checkoutSessionId = event.type.startsWith("checkout.session.")
    ? objectId
    : null;

  return {
    stripeObjectId: objectId,
    stripeCustomerId: customerId,
    checkoutSessionId,
    subscriptionId,
  };
}

function appOrigin(): string {
  return must(process.env.NEXT_PUBLIC_APP_URL, "NEXT_PUBLIC_APP_URL").replace(
    /\/$/,
    "",
  );
}

function guessSenderName(senderEmail: string | null): string | null {
  if (!senderEmail) return null;
  const local = senderEmail.split("@")[0] ?? "";
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((w) => w.slice(0, 1).toUpperCase() + w.slice(1))
    .join(" ");
}

async function getMemberIdByClerkUserId(
  clerkUserId: string,
): Promise<string | null> {
  if (!clerkUserId) return null;
  const res = await sql`
    select id
    from members
    where clerk_user_id = ${clerkUserId}
    limit 1
  `;
  return (res.rows[0]?.id as string | undefined) ?? null;
}

async function getMemberIdByStripeCustomerId(
  customerId: string,
): Promise<string | null> {
  if (!customerId) return null;
  const res = await sql`
    select id
    from members
    where stripe_customer_id = ${customerId}
    limit 1
  `;
  return (res.rows[0]?.id as string | undefined) ?? null;
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

async function resolveMemberIdFromSession(
  session: Stripe.Checkout.Session,
): Promise<{
  memberId: string | null;
  customerId: string;
}> {
  const customerId =
    (typeof session.customer === "string"
      ? session.customer
      : session.customer?.id) ?? "";

  if (customerId) {
    const byCustomer = await getMemberIdByStripeCustomerId(customerId);
    if (byCustomer) return { memberId: byCustomer, customerId };
  }

  const clerkUserId = (session.client_reference_id ?? "").toString().trim();
  if (clerkUserId) {
    const byClerk = await getMemberIdByClerkUserId(clerkUserId);
    if (byClerk) return { memberId: byClerk, customerId };
  }

  const emailRaw = (
    session.customer_details?.email ??
    session.customer_email ??
    ""
  )
    .toString()
    .trim();
  const email = normalizeEmail(emailRaw);
  if (email) {
    const ensured = await ensureMemberByEmail({
      email,
      source: "stripe",
      sourceDetail: {
        checkout_session_id: session.id,
        stripe_customer_id: customerId || null,
        mode: session.mode ?? null,
        kind: (session.metadata?.kind ?? "") || null,
        album_slug: (session.metadata?.albumSlug ?? "") || null,
      },
      marketingOptIn: true,
    });
    return { memberId: ensured.id, customerId };
  }

  return { memberId: null, customerId };
}

function sessionIsPaid(session: Stripe.Checkout.Session): boolean {
  const ps = (session.payment_status ?? "").toString();
  if (ps === "paid" || ps === "no_payment_required") return true;

  const pi = session.payment_intent;
  if (pi && typeof pi === "object") {
    const maybe = pi as { status?: unknown };
    const st = typeof maybe.status === "string" ? maybe.status : "";
    if (st === "succeeded") return true;
  }

  return false;
}

async function resolveGiftIdForSession(
  sessionId: string,
  md: Record<string, string>,
): Promise<string | null> {
  const giftIdFromMd = (md.giftId ?? "").trim();
  const tokenHashFromMd = (md.giftTokenHash ?? "").trim();

  if (giftIdFromMd) {
    const r =
      await sql`select id from gifts where id = ${giftIdFromMd}::uuid limit 1`;
    return (r.rows[0]?.id as string | undefined) ?? null;
  }

  if (tokenHashFromMd) {
    const r =
      await sql`select id from gifts where token_hash = ${tokenHashFromMd} limit 1`;
    return (r.rows[0]?.id as string | undefined) ?? null;
  }

  const r = await sql`
    select id
    from gifts
    where stripe_checkout_session_id = ${sessionId}
    limit 1
  `;
  return (r.rows[0]?.id as string | undefined) ?? null;
}

async function sendGiftCreatedEmail(args: {
  giftId: string;
  to: string;
  giftUrl: string;
  albumTitle: string;
  albumArtist?: string;
  albumCoverUrl?: string;
  personalNote?: string | null;
  senderName?: string | null;
}) {
  const resend = new Resend(must(process.env.RESEND_API_KEY, "RESEND_API_KEY"));
  const from = must(process.env.RESEND_FROM_GIFTS, "RESEND_FROM_GIFTS");
  const subject = `🎁 You’ve been gifted ${args.albumTitle || "a release"}`;

  const emailElement = React.createElement(GiftCreatedEmail, {
    appName: "BJR",
    toEmail: args.to,
    albumTitle: args.albumTitle || "a release",
    albumArtist: args.albumArtist,
    albumCoverUrl: args.albumCoverUrl,
    personalNote: args.personalNote ?? null,
    senderName: args.senderName ?? null,
    giftUrl: args.giftUrl,
    supportEmail: "gifts@post.brendanjohnroch.com",
  });

  const { data, error } = await resend.emails.send({
    from,
    to: [args.to],
    subject,
    react: emailElement,
    tags: [{ name: "kind", value: "gift" }],
  });

  if (error) throw new Error(error.message);

  await sql`
    update gifts
    set gift_email_sent_at = coalesce(gift_email_sent_at, now()),
        gift_email_resend_id = coalesce(gift_email_resend_id, ${data?.id ?? null})
    where id = ${args.giftId}::uuid
  `;
}

async function finalizeGiftPurchase(
  stripe: Stripe,
  sessionId: string,
  mdHint: Record<string, string>,
) {
  // Re-fetch session (expand PI) to avoid stale webhook snapshots.
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["payment_intent"],
  });

  const md = (session.metadata ?? {}) as Record<string, string>;
  const mergedMd: Record<string, string> = { ...mdHint, ...md }; // real session wins

  if (!sessionIsPaid(session)) return;

  const resolvedGiftId = await resolveGiftIdForSession(session.id, mergedMd);
  if (!resolvedGiftId) return;

  // Canonical gift fields from DB
  const giftRowRes = await sql`
    select
      id,
      status,
      album_slug,
      entitlement_key,
      recipient_email,
      recipient_member_id,
      message,
      sender_email,
      gift_email_dedupe_hash
    from gifts
    where id = ${resolvedGiftId}::uuid
    limit 1
  `;
  const giftRow = giftRowRes.rows[0] as
    | {
        id: string;
        status: string;
        album_slug: string;
        entitlement_key: string;
        recipient_email: string;
        recipient_member_id: string | null;
        message: string | null;
        sender_email: string | null;
        gift_email_dedupe_hash: string | null;
      }
    | undefined;
  if (!giftRow) return;

  const recipientEmail =
    normalizeEmail((giftRow.recipient_email ?? "").trim()) ||
    normalizeEmail((mergedMd.recipientEmail ?? "").trim());

  const entitlementKey =
    (giftRow.entitlement_key ?? "").trim() ||
    (mergedMd.entitlementKey ?? "").trim();
  const albumSlug =
    (giftRow.album_slug ?? "").trim() || (mergedMd.albumSlug ?? "").trim();

  if (!recipientEmail || !entitlementKey) return;

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : ((session.payment_intent as Stripe.PaymentIntent | null)?.id ?? null);

  const amountTotal =
    typeof session.amount_total === "number" ? session.amount_total : null;
  const currency = (session.currency ?? "").toString() || null;

  // Mark paid (idempotent)
  await sql`
    update gifts
    set status = 'paid'::gift_status,
        paid_at = coalesce(paid_at, now()),
        stripe_checkout_session_id = coalesce(stripe_checkout_session_id, ${session.id}),
        stripe_payment_intent_id = coalesce(stripe_payment_intent_id, ${paymentIntentId}),
        amount_total_cents = coalesce(amount_total_cents, ${amountTotal}),
        currency = coalesce(currency, ${currency})
    where id = ${resolvedGiftId}::uuid
      and status in ('draft'::gift_status, 'pending_payment'::gift_status, 'paid'::gift_status)
  `;

  // Ensure recipient member and attach.
  const ensured = await ensureMemberByEmail({
    email: recipientEmail,
    source: "gift_paid",
    sourceDetail: { album_slug: albumSlug, stripe_session_id: session.id },
    marketingOptIn: true,
  });

  await sql`
    update gifts
    set recipient_member_id = ${ensured.id}::uuid
    where id = ${resolvedGiftId}::uuid
      and recipient_member_id is null
  `;

  // Grant entitlement (idempotent in your layer)
  await grantEntitlement({
    memberId: ensured.id,
    entitlementKey,
    grantedBy: "system",
    grantReason: `gift_paid:${albumSlug || "unknown"}`,
    grantSource: "stripe_gift",
    grantSourceRef: session.id,
    expiresAt: null,
    correlationId: session.id,
    eventSource: EVENT_SOURCES.STRIPE,
  });

  // Email dedupe gate: send once
  const dedupeCode = crypto.randomBytes(32).toString("base64url");
  const dedupeHash = sha256Hex(dedupeCode);

  const gate = await sql`
    update gifts
    set gift_email_dedupe_hash = ${dedupeHash},
        gift_email_created_at = coalesce(gift_email_created_at, now())
    where id = ${resolvedGiftId}::uuid
      and gift_email_dedupe_hash is null
    returning id
  `;
  if (gate.rowCount === 0) return;

  // Suppression check
  const sup = await sql`
    select 1
    from email_suppressions
    where email::citext = ${recipientEmail}::citext
    limit 1
  `;
  if ((sup.rowCount ?? 0) > 0) return;

  const giftUrl = `${appOrigin()}/gift/${encodeURIComponent(resolvedGiftId)}`;

  let albumTitle = albumSlug || "a release";
  let albumArtist: string | undefined;
  let albumCoverUrl: string | undefined;

  try {
    const meta = await getAlbumEmailMetaBySlug(albumSlug);
    if (meta) {
      albumTitle = meta.title;
      albumArtist = meta.artist ?? undefined;
      albumCoverUrl = meta.artworkUrl ?? undefined;
    }
  } catch {
    // cosmetic only
  }

  const personalNote = giftRow.message ?? null;
  const senderName = guessSenderName(giftRow.sender_email ?? null);

  await sendGiftCreatedEmail({
    giftId: resolvedGiftId,
    to: recipientEmail,
    giftUrl,
    albumTitle,
    albumArtist,
    albumCoverUrl,
    personalNote,
    senderName,
  });
}

export async function POST(req: Request) {
  const STRIPE_SECRET_KEY = assertStripeSecretKey(
    process.env.STRIPE_SECRET_KEY ?? "",
  );
  const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

  if (!STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { ok: false, error: "Missing Stripe env vars" },
      { status: 500 },
    );
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json(
      { ok: false, error: "Missing stripe-signature" },
      { status: 400 },
    );
  }

  const body = await req.text();
  const stripe = new Stripe(STRIPE_SECRET_KEY);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid signature";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  const refs = refsFromStripeEvent(event);

  const claim = await claimStripeWebhookEvent({
    eventId: event.id,
    eventType: event.type,
    refs,
  });

  if (claim === "handled") {
    return NextResponse.json({ ok: true, deduped: true });
  }

  if (claim === "processing") {
    return NextResponse.json(
      { ok: false, error: "Webhook event is already processing" },
      { status: 503 },
    );
  }

  try {
    if (
      event.type === "refund.created" ||
      event.type === "refund.updated" ||
      event.type === "refund.failed"
    ) {
      const refund = event.data.object as Stripe.Refund;
      const outcome = await recordStripeRefund({
        refund,
        correlationId: event.id,
      });

      if (!outcome.matched) {
        console.warn("Stripe refund did not match a direct purchase", {
          eventId: event.id,
          refundId: refund.id,
        });
      }

      await recordStripeWebhookHandled(event.id);
      return NextResponse.json({ ok: true });
    }

    // Subscription lifecycle
    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const sub = event.data.object as Stripe.Subscription;
      await reconcileStripeSubscription({ stripe, subscription: sub });
      await recordStripeWebhookHandled(event.id);
      return NextResponse.json({ ok: true });
    }

    // Gifts: finalize on both immediate + async success
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const s = event.data.object as Stripe.Checkout.Session;
      const md = (s.metadata ?? {}) as Record<string, string>;
      const looksGift =
        (md.kind ?? "") === "gift" ||
        (md.giftId ?? "").trim() ||
        (md.giftTokenHash ?? "").trim();

      if (looksGift) {
        await finalizeGiftPurchase(stripe, s.id, md);
        await recordStripeWebhookHandled(event.id);
        return NextResponse.json({ ok: true });
      }
      // fall through to normal checkout logic (completed only)
    }

    if (event.type === "checkout.session.async_payment_failed") {
      await recordStripeWebhookHandled(event.id);
      return NextResponse.json({ ok: true });
    }

    // Non-gift: only act on checkout.session.completed
    if (event.type !== "checkout.session.completed") {
      await recordStripeWebhookHandled(event.id);
      return NextResponse.json({ ok: true });
    }

    const sessionSnapshot = event.data.object as Stripe.Checkout.Session;

    if (sessionSnapshot.mode === "subscription") {
      const subscriptionId = readStripeId(
        sessionSnapshot.subscription as unknown,
      );

      if (!subscriptionId) {
        throw new Error(
          `Subscription Checkout session ${sessionSnapshot.id} has no subscription id`,
        );
      }

      const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ["latest_invoice.payment_intent"],
      });

      await reconcileStripeSubscription({ stripe, subscription });
      await recordStripeWebhookHandled(event.id);
      return NextResponse.json({ ok: true });
    }

    const session = await stripe.checkout.sessions.retrieve(
      sessionSnapshot.id,
      { expand: ["payment_intent.latest_charge"] },
    );

    if (!sessionIsPaid(session)) {
      throw new Error(
        `Checkout session ${session.id} completed without a settled payment`,
      );
    }

    const { memberId, customerId } = await resolveMemberIdFromSession(session);
    if (!memberId) {
      throw new Error(
        `Paid checkout session ${session.id} could not resolve or create a member`,
      );
    }

    if (customerId) await attachStripeCustomerId(memberId, customerId);

    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
      limit: 100,
    });

    const items = Array.isArray(lineItems?.data) ? lineItems.data : [];
    const priceIds = items
      .map((li) => li.price?.id)
      .filter((v): v is string => !!v);
    if (priceIds.length === 0) {
      throw new Error(
        `Paid Checkout session ${session.id} has no line-item price IDs`,
      );
    }

    const mapped = await sql`
      select price_id, entitlement_key, scope_id, scope_meta
      from stripe_price_entitlements
      where price_id in (
        select jsonb_array_elements_text(${JSON.stringify(priceIds)}::jsonb)
      )
    `;
    const rows = mapped.rows as PriceEntitlementRow[];

    const mappedPriceIds = new Set(rows.map((row) => row.price_id));
    const unmappedPriceIds = priceIds.filter(
      (priceId) => !mappedPriceIds.has(priceId),
    );

    if (unmappedPriceIds.length > 0) {
      throw new Error(
        `Stripe checkout session ${session.id} has unmapped price IDs: ${unmappedPriceIds.join(", ")}`,
      );
    }

    if (rows.length === 0) {
      throw new Error(
        `Stripe checkout session ${session.id} completed with no mapped entitlements`,
      );
    }

    await recordPaidStripeCheckoutPurchase({
      session,
      memberId,
      correlationId: event.id,
      entitlements: rows.map((row) => ({
        priceId: row.price_id,
        entitlementKey: row.entitlement_key,
        scopeId: row.scope_id,
        scopeMeta: (row.scope_meta ?? {}) as Record<string, unknown>,
      })),
    });

    await recordStripeWebhookHandled(event.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = safeErrMessage(err);

    console.error("stripe webhook handler error", {
      eventId: event.id,
      type: event.type,
      message,
    });

    await recordStripeWebhookFailure({
      eventId: event.id,
      message,
    });

    return NextResponse.json(
      { ok: false, error: "Webhook processing failed" },
      { status: 500 },
    );
  }
}
