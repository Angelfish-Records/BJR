"use client";

import type { ChangeEvent } from "react";

import { ENT } from "@/lib/entitlementVocab";
import {
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
  albums: AlbumForScope[];
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

type GrantMode =
  | ""
  | "friend"
  | "patron"
  | "partner"
  | "catalogue-playback"
  | "album-playback"
  | "album-download";

type EntitlementDisplay = {
  label: string;
  technical: string;
};

const DOWNLOAD_ALBUM_PREFIX = ENT.downloadAlbum("");

function albumFromScope(
  albums: AlbumForScope[],
  scopeId: string | null,
): AlbumForScope | null {
  if (!scopeId?.startsWith("alb:")) return null;

  const albumId = scopeId.slice(4);
  return albums.find((album) => album.id === albumId) ?? null;
}

function albumFromDownloadKey(
  albums: AlbumForScope[],
  entitlementKey: string,
): AlbumForScope | null {
  if (!entitlementKey.startsWith(DOWNLOAD_ALBUM_PREFIX)) return null;

  const slug = entitlementKey.slice(DOWNLOAD_ALBUM_PREFIX.length);
  return albums.find((album) => album.slug === slug) ?? null;
}

function humanizeEntitlementKey(entitlementKey: string): string {
  if (entitlementKey.startsWith("{")) return "Technical entitlement";

  const words = entitlementKey.replaceAll("_", " ").trim();
  if (!words) return "Entitlement";

  return words.charAt(0).toUpperCase() + words.slice(1);
}

function describeEntitlement(
  entitlementKey: string,
  scopeId: string | null,
  albums: AlbumForScope[],
): EntitlementDisplay {
  const technical = scopeId
    ? `${entitlementKey} — ${scopeId}`
    : entitlementKey;

  if (entitlementKey === ENT.tier("friend")) {
    return { label: "Friend membership", technical };
  }

  if (entitlementKey === ENT.tier("patron")) {
    return { label: "Patron membership", technical };
  }

  if (entitlementKey === ENT.tier("partner")) {
    return { label: "Partner membership", technical };
  }

  if (entitlementKey === ENT.playAlbum()) {
    if (!scopeId || scopeId === "catalogue") {
      return { label: "Catalogue playback", technical };
    }

    const album = albumFromScope(albums, scopeId);
    return {
      label: album ? `${album.title} playback` : "Album playback",
      technical,
    };
  }

  if (entitlementKey.startsWith(DOWNLOAD_ALBUM_PREFIX)) {
    const album = albumFromDownloadKey(albums, entitlementKey);
    return {
      label: album ? `${album.title} download` : "Album download",
      technical,
    };
  }

  if (entitlementKey === ENT.albumShareGrant()) {
    const album = albumFromScope(albums, scopeId);
    return {
      label: album
        ? `${album.title} pre-release override`
        : "Album pre-release override",
      technical,
    };
  }

  return {
    label: humanizeEntitlementKey(entitlementKey),
    technical,
  };
}

function resolveMembershipLabel(
  current: CurrentEntitlementRow[],
): string {
  const keys = new Set(current.map((row) => row.entitlement_key));

  if (keys.has(ENT.tier("partner"))) return "Partner";
  if (keys.has(ENT.tier("patron"))) return "Patron";
  if (keys.has(ENT.tier("friend"))) return "Friend";
  return "None";
}

function resolvePlaybackLabel(
  current: CurrentEntitlementRow[],
): string {
  const playback = current.filter(
    (row) => row.entitlement_key === ENT.playAlbum(),
  );

  if (
    playback.some(
      (row) => !row.scope_id || row.scope_id === "catalogue",
    )
  ) {
    return "Whole catalogue";
  }

  const albumCount = playback.filter((row) =>
    row.scope_id?.startsWith("alb:"),
  ).length;

  if (albumCount === 1) return "1 album";
  if (albumCount > 1) return `${albumCount} albums`;

  return "No direct grant";
}

function MemberSummary(
  props: Readonly<{
    selected: MemberRow;
    memberDetails: SelectedMemberDetails | null;
    current: CurrentEntitlementRow[];
  }>,
) {
  const items = [
    {
      label: "Membership",
      value: resolveMembershipLabel(props.current),
    },
    {
      label: "Playback",
      value: resolvePlaybackLabel(props.current),
    },
    {
      label: "Billing",
      value: props.memberDetails?.stripe_customer_id
        ? "Stripe connected"
        : "No Stripe customer",
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
          <div style={{ marginTop: 4, fontSize: 13, fontWeight: 800 }}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function TechnicalIdentityDetails(
  props: Readonly<{
    selected: MemberRow;
    memberDetails: SelectedMemberDetails | null;
  }>,
) {
  return (
    <details style={{ marginTop: 2 }}>
      <summary
        style={{
          cursor: "pointer",
          fontSize: 11,
          opacity: 0.58,
        }}
      >
        Technical identity
      </summary>

      <div
        style={{
          display: "grid",
          gap: 5,
          marginTop: 8,
          paddingLeft: 2,
          fontSize: 11,
          opacity: 0.62,
          wordBreak: "break-all",
        }}
      >
        <div>Member ID: {props.selected.id}</div>
        <div>
          Clerk: {props.memberDetails?.clerk_user_id ?? "not linked"}
        </div>
        <div>
          Stripe customer:{" "}
          {props.memberDetails?.stripe_customer_id ?? "not linked"}
        </div>
        <div>Source: {props.memberDetails?.source ?? "—"}</div>
      </div>
    </details>
  );
}

function grantModeFromFields(
  entitlementKey: string,
  scopeId: string,
): GrantMode {
  if (entitlementKey === ENT.tier("friend")) return "friend";
  if (entitlementKey === ENT.tier("patron")) return "patron";
  if (entitlementKey === ENT.tier("partner")) return "partner";

  if (entitlementKey === ENT.playAlbum()) {
    if (scopeId.startsWith("alb:")) return "album-playback";
    return "catalogue-playback";
  }

  if (entitlementKey.startsWith(DOWNLOAD_ALBUM_PREFIX)) {
    return "album-download";
  }

  return "";
}

function ManualOverrideSection(
  props: Readonly<{
    albums: AlbumForScope[];
    memberDetails: SelectedMemberDetails | null;
    open: boolean;
    entitlementKey: string;
    scopeId: string;
    reason: string;
    busy: boolean;
    reconcileBusy: boolean;
    onOpenChange: (value: boolean) => void;
    onEntitlementKeyChange: (value: string) => void;
    onScopeIdChange: (value: string) => void;
    onReasonChange: (value: string) => void;
    onGrant: () => Promise<void>;
    onReconcileStripe: () => Promise<void>;
  }>,
) {
  const grantMode = grantModeFromFields(
    props.entitlementKey,
    props.scopeId,
  );

  const scopedAlbum = albumFromScope(
    props.albums,
    props.scopeId || null,
  );
  const downloadAlbum = albumFromDownloadKey(
    props.albums,
    props.entitlementKey,
  );

  const selectedAlbum =
    grantMode === "album-download" ? downloadAlbum : scopedAlbum;

  const needsAlbum =
    grantMode === "album-playback" ||
    grantMode === "album-download";

  const grantDisabled =
    props.busy ||
    !grantMode ||
    (needsAlbum && !selectedAlbum);

  function selectGrantMode(nextMode: GrantMode) {
    const firstAlbum = props.albums[0] ?? null;

    if (nextMode === "friend") {
      props.onEntitlementKeyChange(ENT.tier("friend"));
      props.onScopeIdChange("");
      return;
    }

    if (nextMode === "patron") {
      props.onEntitlementKeyChange(ENT.tier("patron"));
      props.onScopeIdChange("");
      return;
    }

    if (nextMode === "partner") {
      props.onEntitlementKeyChange(ENT.tier("partner"));
      props.onScopeIdChange("");
      return;
    }

    if (nextMode === "catalogue-playback") {
      props.onEntitlementKeyChange(ENT.playAlbum());
      props.onScopeIdChange("catalogue");
      return;
    }

    if (!firstAlbum) {
      props.onEntitlementKeyChange("");
      props.onScopeIdChange("");
      return;
    }

    if (nextMode === "album-playback") {
      props.onEntitlementKeyChange(ENT.playAlbum());
      props.onScopeIdChange(`alb:${firstAlbum.id}`);
      return;
    }

    if (nextMode === "album-download") {
      props.onEntitlementKeyChange(
        ENT.downloadAlbum(firstAlbum.slug),
      );
      props.onScopeIdChange("");
      return;
    }

    props.onEntitlementKeyChange("");
    props.onScopeIdChange("");
  }

  function selectAlbum(albumId: string) {
    const album =
      props.albums.find((candidate) => candidate.id === albumId) ??
      null;

    if (!album) return;

    if (grantMode === "album-download") {
      props.onEntitlementKeyChange(
        ENT.downloadAlbum(album.slug),
      );
      props.onScopeIdChange("");
      return;
    }

    props.onScopeIdChange(`alb:${album.id}`);
  }

  const isTierGrant =
    grantMode === "friend" ||
    grantMode === "patron" ||
    grantMode === "partner";

  const hasStripeCustomer = Boolean(
    props.memberDetails?.stripe_customer_id,
  );

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
        <span>Admin tools</span>
        <span style={{ opacity: 0.6 }}>
          {props.open ? "−" : "+"}
        </span>
      </button>

      {props.open ? (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gap: 10 }}>
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  opacity: 0.78,
                }}
              >
                Grant access
              </div>
              <div
                style={{
                  marginTop: 3,
                  fontSize: 11,
                  opacity: 0.52,
                }}
              >
                Choose the access you want to add. Canonical keys and
                scopes are handled automatically.
              </div>
            </div>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, opacity: 0.66 }}>
                Access type
              </span>
              <select
                value={grantMode}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  selectGrantMode(event.target.value as GrantMode)
                }
                style={fieldStyle}
              >
                <option value="">Choose access…</option>

                <optgroup label="Membership tier">
                  <option value="friend">Friend membership</option>
                  <option value="patron">Patron membership</option>
                  <option value="partner">Partner membership</option>
                </optgroup>

                <optgroup label="Playback">
                  <option value="catalogue-playback">
                    Whole catalogue playback
                  </option>
                  <option value="album-playback">
                    Specific album playback
                  </option>
                </optgroup>

                <optgroup label="Downloads">
                  <option value="album-download">
                    Specific album download
                  </option>
                </optgroup>
              </select>
            </label>

            {needsAlbum ? (
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, opacity: 0.66 }}>
                  Album
                </span>
                <select
                  value={selectedAlbum?.id ?? ""}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                    selectAlbum(event.target.value)
                  }
                  style={fieldStyle}
                >
                  {props.albums.map((album) => (
                    <option key={album.id} value={album.id}>
                      {album.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {isTierGrant ? (
              <div
                style={{
                  padding: "9px 10px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.035)",
                  fontSize: 11,
                  lineHeight: 1.45,
                  opacity: 0.62,
                }}
              >
                Membership tier and playback permission are separate
                grants. Add catalogue playback separately if this member
                should also receive unrestricted listening access.
              </div>
            ) : null}

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, opacity: 0.66 }}>
                Admin note
                <span style={{ opacity: 0.55 }}> · optional</span>
              </span>
              <input
                value={props.reason}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  props.onReasonChange(event.target.value)
                }
                placeholder="Why is this access being granted?"
                style={fieldStyle}
              />
            </label>

            <div>
              <button
                type="button"
                onClick={() => {
                  void props.onGrant();
                }}
                disabled={grantDisabled}
                style={{
                  ...primaryButtonStyle,
                  opacity: grantDisabled ? 0.5 : 1,
                  cursor: grantDisabled ? "default" : "pointer",
                }}
              >
                {props.busy ? "Granting…" : "Grant access"}
              </button>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gap: 8,
              paddingTop: 14,
              borderTop: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  opacity: 0.78,
                }}
              >
                Subscription access
              </div>
              <div
                style={{
                  marginTop: 3,
                  maxWidth: 620,
                  fontSize: 11,
                  lineHeight: 1.45,
                  opacity: 0.52,
                }}
              >
                Re-check this member&apos;s Stripe subscriptions and
                refresh subscription-derived grants. This does not
                reconcile one-off album purchases.
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={() => {
                  void props.onReconcileStripe();
                }}
                disabled={!hasStripeCustomer || props.reconcileBusy}
                style={{
                  ...subtleButtonStyle,
                  opacity:
                    !hasStripeCustomer || props.reconcileBusy ? 0.45 : 1,
                  cursor:
                    !hasStripeCustomer || props.reconcileBusy
                      ? "default"
                      : "pointer",
                }}
              >
                {props.reconcileBusy
                  ? "Syncing…"
                  : "Sync subscription access"}
              </button>
            </div>

            {!hasStripeCustomer ? (
              <div style={{ fontSize: 11, opacity: 0.46 }}>
                No Stripe customer is linked to this member.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function getRevokeOpacity(active: boolean, revokeBusy: boolean): number {
  if (!active) return 0.35;
  if (revokeBusy) return 0.6;
  return 1;
}

function EffectiveEntitlementsSection(
  props: Readonly<{
    albums: AlbumForScope[];
    current: CurrentEntitlementRow[];
    busy: boolean;
  }>,
) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.72 }}>
          Current access
        </div>
        {props.busy ? (
          <div style={{ fontSize: 11, opacity: 0.56 }}>
            Refreshing…
          </div>
        ) : null}
      </div>

      <div style={{ display: "grid" }}>
        {props.current.map((entitlement, index) => {
          const display = describeEntitlement(
            entitlement.entitlement_key,
            entitlement.scope_id,
            props.albums,
          );

          return (
            <div
              key={`${entitlement.entitlement_key}-${entitlement.scope_id ?? "global"}`}
              style={{
                padding: "10px 2px",
                borderTop:
                  index === 0
                    ? "none"
                    : "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 800 }}>
                {display.label}
              </div>

              {entitlement.granted_at || entitlement.expires_at ? (
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 11,
                    opacity: 0.52,
                  }}
                >
                  {entitlement.granted_at
                    ? `Granted ${formatDateTime(entitlement.granted_at)}`
                    : ""}
                  {entitlement.expires_at
                    ? ` · expires ${formatDateTime(entitlement.expires_at)}`
                    : ""}
                </div>
              ) : null}

              <details style={{ marginTop: 4 }}>
                <summary
                  style={{
                    cursor: "pointer",
                    fontSize: 10,
                    opacity: 0.38,
                  }}
                >
                  Technical details
                </summary>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 10,
                    opacity: 0.44,
                    wordBreak: "break-all",
                  }}
                >
                  {display.technical}
                </div>
              </details>
            </div>
          );
        })}

        {props.current.length === 0 ? (
          <div style={{ fontSize: 12, opacity: 0.58 }}>
            No active access grants.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AccessOperationsSection(props: AccessOperationsProps) {
  return (
    <div style={cardStyle}>
      <div style={sectionHeaderStyle}>Member access</div>

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 18, fontWeight: 900 }}>
          {props.selected.email}
        </div>
      </div>

      <MemberSummary
        selected={props.selected}
        memberDetails={props.memberDetails}
        current={props.current}
      />

      <div
        style={{
          display: "grid",
          gap: 14,
          marginTop: 16,
          paddingTop: 14,
          borderTop: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <EffectiveEntitlementsSection
          albums={props.albums}
          current={props.current}
          busy={props.memberBusy}
        />

        <TechnicalIdentityDetails
          selected={props.selected}
          memberDetails={props.memberDetails}
        />

        <ManualOverrideSection
          albums={props.albums}
          memberDetails={props.memberDetails}
          open={props.manualOpen}
          entitlementKey={props.entitlementKey}
          scopeId={props.scopeId}
          reason={props.reason}
          busy={props.grantBusy}
          reconcileBusy={props.reconcileBusy}
          onOpenChange={props.onManualOpenChange}
          onEntitlementKeyChange={props.onEntitlementKeyChange}
          onScopeIdChange={props.onScopeIdChange}
          onReasonChange={props.onReasonChange}
          onGrant={props.onGrant}
          onReconcileStripe={props.onReconcileStripe}
        />
      </div>
    </div>
  );
}

function StripeWebhookLedgerSection(props: StripeWebhookLedgerProps) {
  const failedCount = props.events.filter((event) =>
    Boolean(event.handler_error),
  ).length;

  return (
    <div style={cardStyle}>
      <details>
        <summary
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 800,
            opacity: 0.72,
          }}
        >
          <span>Payment diagnostics</span>
          <span
            style={{
              fontWeight: 600,
              color:
                failedCount > 0
                  ? "#ffd0d0"
                  : "rgba(255,255,255,0.58)",
            }}
          >
            {failedCount > 0
              ? `${failedCount} failed`
              : `${props.events.length} events`}
          </span>
        </summary>

        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
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
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 11,
                        opacity: 0.58,
                      }}
                    >
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

                <div
                  style={{
                    marginTop: 8,
                    fontSize: 11,
                    opacity: 0.64,
                  }}
                >
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
              No Stripe webhook events are linked to this member.
            </div>
          ) : null}
        </div>
      </details>
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
        <span>Grant history ({props.grants.length})</span>
        <span style={{ opacity: 0.6 }}>{props.open ? "−" : "+"}</span>
      </button>

      {props.open ? (
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {props.grants.map((grant) => {
            const active = isGrantActive(grant);
            const revokeBusy = props.revokeBusyId === grant.id;
            const revokeDisabled = !active || revokeBusy;
            const display = describeEntitlement(
              grant.entitlement_key,
              grant.scope_id,
              props.albums,
            );

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
                    <span style={{ fontWeight: 800 }}>
                      {display.label}
                    </span>
                  </div>

                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 11,
                      opacity: 0.56,
                    }}
                  >
                    {active ? "Active" : "Inactive"} · created{" "}
                    {formatDateTime(grant.created_at)}
                    {grant.expires_at
                      ? ` · expires ${formatDateTime(grant.expires_at)}`
                      : ""}
                    {grant.grant_source
                      ? ` · ${grant.grant_source}`
                      : ""}
                  </div>

                  <details style={{ marginTop: 4 }}>
                    <summary
                      style={{
                        cursor: "pointer",
                        fontSize: 10,
                        opacity: 0.38,
                      }}
                    >
                      Technical details
                    </summary>
                    <div
                      style={{
                        display: "grid",
                        gap: 3,
                        marginTop: 4,
                        fontSize: 10,
                        opacity: 0.44,
                        wordBreak: "break-all",
                      }}
                    >
                      <div>{display.technical}</div>
                      {grant.grant_reason ? (
                        <div>Reason: {grant.grant_reason}</div>
                      ) : null}
                    </div>
                  </details>
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
        albums={props.albums}
        grants={props.grants}
        open={props.open}
        revokeBusyId={props.revokeBusyId}
        onOpenChange={props.onOpenChange}
        onRevoke={props.onRevoke}
      />
    </div>
  );
}
