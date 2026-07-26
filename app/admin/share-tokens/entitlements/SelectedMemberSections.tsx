"use client";

import type { ChangeEvent } from "react";

import {
  buildAccessHealth,
  formatDateOnly,
  formatDateTime,
  getSelectedJoinedAt,
  getWebhookObjectLabel,
  getWebhookStatusLabel,
  isGrantActive,
} from "./model";
import {
  cardStyle,
  fieldStyle,
  healthCardStyle,
  primaryButtonStyle,
  sectionHeaderStyle,
  subtleButtonStyle,
} from "./styles";
import type {
  AlbumForScope,
  CurrentEntitlementRow,
  GrantRow,
  MemberRow,
  SelectedMemberDetails,
  StripeWebhookEventRow,
} from "./types";

type AccessOperationsProps = Readonly<{
  albums: AlbumForScope[];
  selected: MemberRow;
  memberDetails: SelectedMemberDetails | null;
  current: CurrentEntitlementRow[];
  stripeWebhookEvents: StripeWebhookEventRow[];
  memberBusy: boolean;
  reconcileBusy: boolean;
  grantBusy: boolean;
  manualOpen: boolean;
  entitlementKey: string;
  scopeId: string;
  reason: string;
  onManualOpenChange: (value: boolean) => void;
  onEntitlementKeyChange: (value: string) => void;
  onScopeIdChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onGrant: () => Promise<void>;
  onReconcileStripe: () => Promise<void>;
}>;

type StripeWebhookLedgerProps = Readonly<{
  events: StripeWebhookEventRow[];
}>;

type GrantAuditProps = Readonly<{
  grants: GrantRow[];
  open: boolean;
  revokeBusyId: string | null;
  onOpenChange: (value: boolean) => void;
  onRevoke: (grantId: string) => Promise<void>;
}>;

type SelectedMemberSectionsProps = Readonly<
  AccessOperationsProps &
    StripeWebhookLedgerProps &
    GrantAuditProps
>;

function MemberMetadata(props: Readonly<{
  selected: MemberRow;
  memberDetails: SelectedMemberDetails | null;
}>) {
  const items = [
    {
      label: "Source",
      value: props.memberDetails?.source ?? "—",
    },
    {
      label: "Clerk",
      value: props.memberDetails?.clerk_user_id ? "Linked" : "Not linked",
    },
    {
      label: "Stripe",
      value: props.memberDetails?.stripe_customer_id ? "Linked" : "Not linked",
    },
    {
      label: "Joined",
      value: formatDateOnly(
        getSelectedJoinedAt(props.selected, props.memberDetails),
      ),
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: 10,
        marginTop: 14,
      }}
    >
      {items.map((item) => (
        <div
          key={item.label}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.03)",
          }}
        >
          <div style={{ fontSize: 11, opacity: 0.58 }}>{item.label}</div>
          <div style={{ marginTop: 4, fontSize: 12, fontWeight: 700 }}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function AccessHealthCards(props: Readonly<{
  current: CurrentEntitlementRow[];
  memberDetails: SelectedMemberDetails | null;
  stripeWebhookEvents: StripeWebhookEventRow[];
}>) {
  const accessHealth = buildAccessHealth(props);

  const playback = accessHealth.hasCataloguePlayback ? "ready" : "missing";
  const download = accessHealth.hasGodDefendDownload ? "download" : "missing";
  const stripe = accessHealth.hasStripeCustomer ? "linked" : "not linked";
  const webhooks =
    accessHealth.failedWebhookCount > 0
      ? `${accessHealth.failedWebhookCount} failed`
      : "clean";

  const items = [
    ["Tier", accessHealth.tier],
    ["Playback", playback],
    ["GOD DEFEND", download],
    ["Stripe", stripe],
    ["Webhooks", webhooks],
  ] as const;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
        gap: 10,
        marginTop: 14,
      }}
    >
      {items.map(([label, value]) => {
        const needsAttention =
          value === "missing" || String(value).includes("failed");

        return (
          <div key={label} style={healthCardStyle}>
            <div style={{ fontSize: 11, opacity: 0.56 }}>{label}</div>
            <div
              style={{
                marginTop: 5,
                fontSize: 14,
                fontWeight: 900,
                color: needsAttention
                  ? "#ffd0d0"
                  : "rgba(255,255,255,0.94)",
              }}
            >
              {value}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ManualOverrideSection(props: Readonly<{
  albums: AlbumForScope[];
  open: boolean;
  entitlementKey: string;
  scopeId: string;
  reason: string;
  busy: boolean;
  onOpenChange: (value: boolean) => void;
  onEntitlementKeyChange: (value: string) => void;
  onScopeIdChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onGrant: () => Promise<void>;
}>) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <button
        type="button"
        onClick={() => props.onOpenChange(!props.open)}
        style={{
          ...subtleButtonStyle,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
          padding: "11px 12px",
          fontWeight: 900,
        }}
      >
        <span>Manual override</span>
        <span style={{ opacity: 0.6 }}>{props.open ? "−" : "+"}</span>
      </button>

      {props.open ? (
        <>
          <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.72 }}>
            Grant entitlement
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, opacity: 0.66 }}>
              Entitlement key
            </div>
            <input
              value={props.entitlementKey}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                props.onEntitlementKeyChange(event.target.value)
              }
              placeholder="e.g. tier_patron, play_album"
              style={fieldStyle}
            />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, opacity: 0.66 }}>Scope ID</div>
            <input
              value={props.scopeId}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                props.onScopeIdChange(event.target.value)
              }
              placeholder="catalogue OR alb:<albumId>"
              style={fieldStyle}
            />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, opacity: 0.66 }}>
              Quick scope helpers
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                marginTop: 2,
              }}
            >
              <button
                type="button"
                onClick={() => props.onScopeIdChange("catalogue")}
                style={subtleButtonStyle}
              >
                scope: catalogue
              </button>
              {props.albums.slice(0, 6).map((album) => (
                <button
                  key={album.slug}
                  type="button"
                  onClick={() => props.onScopeIdChange(`alb:${album.id}`)}
                  style={subtleButtonStyle}
                  title={album.title}
                >
                  alb:{album.id}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, opacity: 0.66 }}>Reason</div>
            <input
              value={props.reason}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                props.onReasonChange(event.target.value)
              }
              placeholder="reason"
              style={fieldStyle}
            />
          </div>

          <div style={{ paddingTop: 2 }}>
            <button
              type="button"
              onClick={() => {
                void props.onGrant();
              }}
              disabled={props.busy}
              style={{
                ...primaryButtonStyle,
                opacity: props.busy ? 0.6 : 1,
                cursor: props.busy ? "default" : "pointer",
              }}
            >
              {props.busy ? "Granting…" : "Grant"}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function getRevokeOpacity(active: boolean, revokeBusy: boolean): number {
  if (!active) return 0.35;
  if (revokeBusy) return 0.6;
  return 1;
}

function EffectiveEntitlementsSection(props: Readonly<{
  current: CurrentEntitlementRow[];
  busy: boolean;
}>) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.72 }}>
          Effective entitlements
        </div>
        {props.busy ? (
          <div style={{ fontSize: 11, opacity: 0.56 }}>Refreshing…</div>
        ) : null}
      </div>

      <div
        style={{
          display: "grid",
          gap: 8,
          alignContent: "start",
        }}
      >
        {props.current.map((entitlement) => (
          <div
            key={`${entitlement.entitlement_key}-${entitlement.scope_id ?? "global"}`}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.03)",
              fontSize: 12,
            }}
          >
            <div style={{ opacity: 0.92, fontWeight: 700 }}>
              {entitlement.entitlement_key}
              {entitlement.scope_id ? (
                <span style={{ opacity: 0.62, fontWeight: 400 }}>
                  {" "}
                  — {entitlement.scope_id}
                </span>
              ) : null}
            </div>

            {entitlement.granted_at || entitlement.expires_at ? (
              <div style={{ marginTop: 4, fontSize: 11, opacity: 0.56 }}>
                {entitlement.granted_at
                  ? `granted ${formatDateTime(entitlement.granted_at)}`
                  : "granted —"}
                {entitlement.expires_at
                  ? ` · expires ${formatDateTime(entitlement.expires_at)}`
                  : ""}
              </div>
            ) : null}
          </div>
        ))}

        {props.current.length === 0 ? (
          <div style={{ fontSize: 12, opacity: 0.58 }}>None.</div>
        ) : null}
      </div>
    </div>
  );
}

function AccessOperationsSection(props: AccessOperationsProps) {
  const canReconcile = Boolean(props.memberDetails?.stripe_customer_id);
  const reconcileDisabled = props.reconcileBusy || !canReconcile;

  return (
    <div style={cardStyle}>
      <div style={sectionHeaderStyle}>Access operations</div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 14,
          flexWrap: "wrap",
          marginTop: 8,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>
            {props.selected.email}
          </div>
          <div
            style={{
              marginTop: 5,
              fontSize: 11,
              opacity: 0.56,
              wordBreak: "break-all",
            }}
          >
            {props.selected.id}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            void props.onReconcileStripe();
          }}
          disabled={reconcileDisabled}
          style={{
            ...primaryButtonStyle,
            opacity: reconcileDisabled ? 0.45 : 1,
            cursor: reconcileDisabled ? "default" : "pointer",
          }}
        >
          {props.reconcileBusy ? "Reconciling…" : "Reconcile Stripe"}
        </button>
      </div>

      <MemberMetadata
        selected={props.selected}
        memberDetails={props.memberDetails}
      />

      <AccessHealthCards
        current={props.current}
        memberDetails={props.memberDetails}
        stripeWebhookEvents={props.stripeWebhookEvents}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr)",
          gap: 14,
          marginTop: 14,
        }}
      >
        <ManualOverrideSection
          albums={props.albums}
          open={props.manualOpen}
          entitlementKey={props.entitlementKey}
          scopeId={props.scopeId}
          reason={props.reason}
          busy={props.grantBusy}
          onOpenChange={props.onManualOpenChange}
          onEntitlementKeyChange={props.onEntitlementKeyChange}
          onScopeIdChange={props.onScopeIdChange}
          onReasonChange={props.onReasonChange}
          onGrant={props.onGrant}
        />

        <EffectiveEntitlementsSection
          current={props.current}
          busy={props.memberBusy}
        />
      </div>
    </div>
  );
}

function StripeWebhookLedgerSection(props: StripeWebhookLedgerProps) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.72 }}>
        Stripe webhook ledger
      </div>

      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
        {props.events.map((event) => {
          const failed = Boolean(event.handler_error);

          return (
            <div
              key={event.event_id}
              style={{
                padding: "11px 12px",
                borderRadius: 12,
                border: failed
                  ? "1px solid rgba(255,120,120,0.28)"
                  : "1px solid rgba(255,255,255,0.10)",
                background: failed
                  ? "rgba(120,0,0,0.16)"
                  : "rgba(255,255,255,0.03)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 800 }}>
                    {event.type}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11, opacity: 0.58 }}>
                    {event.event_id}
                  </div>
                </div>

                <div
                  style={{
                    fontSize: 11,
                    opacity: 0.68,
                    textAlign: "right",
                  }}
                >
                  {getWebhookStatusLabel(event)}
                </div>
              </div>

              <div style={{ marginTop: 8, fontSize: 11, opacity: 0.64 }}>
                {getWebhookObjectLabel(event)}
              </div>

              {event.handler_error ? (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 11,
                    color: "#ffd0d0",
                    wordBreak: "break-word",
                  }}
                >
                  {event.handler_error}
                </div>
              ) : null}
            </div>
          );
        })}

        {props.events.length === 0 ? (
          <div style={{ fontSize: 12, opacity: 0.58 }}>
            No Stripe webhook events linked to this member.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function GrantAuditSection(props: GrantAuditProps) {
  return (
    <div style={cardStyle}>
      <button
        type="button"
        onClick={() => props.onOpenChange(!props.open)}
        style={{
          ...subtleButtonStyle,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          width: "100%",
          padding: "11px 12px",
          fontWeight: 900,
        }}
      >
        <span>Audit history ({props.grants.length} grants)</span>
        <span style={{ opacity: 0.6 }}>{props.open ? "−" : "+"}</span>
      </button>

      {props.open ? (
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {props.grants.map((grant) => {
            const active = isGrantActive(grant);
            const revokeBusy = props.revokeBusyId === grant.id;
            const revokeDisabled = !active || revokeBusy;

            return (
              <div
                key={grant.id}
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "11px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, opacity: 0.94 }}>
                    <span style={{ fontWeight: 700 }}>
                      {grant.entitlement_key}
                    </span>
                    {grant.scope_id ? (
                      <span style={{ opacity: 0.62 }}>
                        {" "}
                        — {grant.scope_id}
                      </span>
                    ) : null}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11, opacity: 0.56 }}>
                    {active ? "active" : "inactive"} · created{" "}
                    {formatDateTime(grant.created_at)}
                    {grant.expires_at
                      ? ` · expires ${formatDateTime(grant.expires_at)}`
                      : ""}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={revokeDisabled}
                  onClick={() => {
                    void props.onRevoke(grant.id);
                  }}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,120,120,0.22)",
                    background: active
                      ? "rgba(120,0,0,0.16)"
                      : "rgba(255,255,255,0.03)",
                    color: "rgba(255,255,255,0.92)",
                    opacity: getRevokeOpacity(active, revokeBusy),
                    cursor: revokeDisabled ? "default" : "pointer",
                    flex: "0 0 auto",
                    fontWeight: 700,
                  }}
                >
                  {revokeBusy ? "Revoking…" : "Revoke"}
                </button>
              </div>
            );
          })}

          {props.grants.length === 0 ? (
            <div style={{ fontSize: 12, opacity: 0.58 }}>No grants.</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function SelectedMemberSections(props: SelectedMemberSectionsProps) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <AccessOperationsSection {...props} />
      <StripeWebhookLedgerSection events={props.events} />
      <GrantAuditSection
        grants={props.grants}
        open={props.open}
        revokeBusyId={props.revokeBusyId}
        onOpenChange={props.onOpenChange}
        onRevoke={props.onRevoke}
      />
    </div>
  );
}
