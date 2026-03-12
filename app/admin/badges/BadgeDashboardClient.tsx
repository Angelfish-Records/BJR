// web/app/admin/badges/BadgeDashboardClient.tsx
"use client";

import React from "react";

type BadgeDefinitionOption = {
  entitlementKey: string;
  title: string;
  description: string | null;
  displayOrder: number;
  imageUrl: string | null;
  featured: boolean;
  shareable: boolean;
};

type BadgePreviewMode =
  | "minutes_streamed"
  | "play_count"
  | "complete_count"
  | "joined_within_window"
  | "active_within_window"
  | "recording_minutes_streamed"
  | "recording_play_count"
  | "recording_complete_count";

type PreviewRow = {
  memberId: string;
  email: string | null;
  joinedAt: string | null;
  listenedMs: number | null;
  minutesStreamed: number | null;
  playCount: number | null;
  completedCount: number | null;
  matchedRecordingId: string | null;
  matchedWindowEventCount: number | null;
};

type PreviewResponse = {
  ok: boolean;
  count?: number;
  rows?: PreviewRow[];
  error?: string;
};

type AwardResponse = {
  ok: boolean;
  result?: {
    entitlementKey: string;
    attempted: number;
    awarded: number;
  };
  error?: string;
};

type Props = {
  embed: boolean;
  badgeDefinitions: BadgeDefinitionOption[];
};

type FormState = {
  entitlementKey: string;
  mode: BadgePreviewMode;
  minMinutes: string;
  minPlayCount: string;
  minCompletedCount: string;
  minProgressCount: string;
  joinedOnOrAfter: string;
  joinedBefore: string;
  activeOnOrAfter: string;
  activeBefore: string;
  recordingId: string;
  limit: string;
  grantReason: string;
};

const DEFAULT_FORM_STATE: FormState = {
  entitlementKey: "",
  mode: "minutes_streamed",
  minMinutes: "500",
  minPlayCount: "10",
  minCompletedCount: "3",
  minProgressCount: "1",
  joinedOnOrAfter: "",
  joinedBefore: "",
  activeOnOrAfter: "",
  activeBefore: "",
  recordingId: "",
  limit: "200",
  grantReason: "",
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString();
}

function formatMetric(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString();
}

function buildPreviewPayload(form: FormState): Record<string, string | number> {
  const limit = form.limit.trim() ? Number(form.limit) : 200;

  switch (form.mode) {
    case "minutes_streamed":
      return {
        mode: form.mode,
        minMinutes: Number(form.minMinutes || "0"),
        limit,
      };

    case "play_count":
      return {
        mode: form.mode,
        minPlayCount: Number(form.minPlayCount || "0"),
        limit,
      };

    case "complete_count":
      return {
        mode: form.mode,
        minCompletedCount: Number(form.minCompletedCount || "0"),
        limit,
      };

    case "joined_within_window": {
      const payload: Record<string, string | number> = {
        mode: form.mode,
        joinedOnOrAfter: form.joinedOnOrAfter,
        limit,
      };

      if (form.joinedBefore.trim()) {
        payload.joinedBefore = form.joinedBefore.trim();
      }

      return payload;
    }

    case "active_within_window": {
      const payload: Record<string, string | number> = {
        mode: form.mode,
        activeOnOrAfter: form.activeOnOrAfter,
        minPlayCount: Number(form.minPlayCount || "0"),
        minProgressCount: Number(form.minProgressCount || "0"),
        minCompleteCount: Number(form.minCompletedCount || "0"),
        limit,
      };

      if (form.activeBefore.trim()) {
        payload.activeBefore = form.activeBefore.trim();
      }

      return payload;
    }

    case "recording_minutes_streamed":
      return {
        mode: form.mode,
        recordingId: form.recordingId,
        minMinutes: Number(form.minMinutes || "0"),
        limit,
      };

    case "recording_play_count":
      return {
        mode: form.mode,
        recordingId: form.recordingId,
        minPlayCount: Number(form.minPlayCount || "0"),
        limit,
      };

    case "recording_complete_count":
      return {
        mode: form.mode,
        recordingId: form.recordingId,
        minCompletedCount: Number(form.minCompletedCount || "0"),
        limit,
      };
  }
}

export default function BadgeDashboardClient({
  embed,
  badgeDefinitions,
}: Props) {
  const sortedBadges = React.useMemo(() => {
    return [...badgeDefinitions].sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) {
        return a.displayOrder - b.displayOrder;
      }

      return a.title.localeCompare(b.title);
    });
  }, [badgeDefinitions]);

  const [form, setForm] = React.useState<FormState>(() => ({
    ...DEFAULT_FORM_STATE,
    entitlementKey: sortedBadges[0]?.entitlementKey ?? "",
  }));

  const [previewRows, setPreviewRows] = React.useState<PreviewRow[]>([]);
  const [previewCount, setPreviewCount] = React.useState<number>(0);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);

  const [awardError, setAwardError] = React.useState<string | null>(null);
  const [awardMessage, setAwardMessage] = React.useState<string | null>(null);
  const [awardLoading, setAwardLoading] = React.useState(false);

  const selectedBadge = React.useMemo(() => {
    return (
      sortedBadges.find(
        (badge) => badge.entitlementKey === form.entitlementKey,
      ) ?? null
    );
  }, [form.entitlementKey, sortedBadges]);

  const updateForm = React.useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((current) => ({
        ...current,
        [key]: value,
      }));
    },
    [],
  );

  const runPreview = React.useCallback(async () => {
    setPreviewLoading(true);
    setPreviewError(null);
    setAwardError(null);
    setAwardMessage(null);

    try {
      const response = await fetch("/api/admin/badges/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildPreviewPayload(form)),
      });

      const json = (await response.json()) as PreviewResponse;

      if (!response.ok || !json.ok) {
        throw new Error(json.error || "Unable to preview badge cohort.");
      }

      setPreviewRows(Array.isArray(json.rows) ? json.rows : []);
      setPreviewCount(typeof json.count === "number" ? json.count : 0);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to preview badge cohort.";
      setPreviewRows([]);
      setPreviewCount(0);
      setPreviewError(message);
    } finally {
      setPreviewLoading(false);
    }
  }, [form]);

  const runAward = React.useCallback(async () => {
    if (!form.entitlementKey) {
      setAwardError("Choose a badge before awarding.");
      return;
    }

    if (previewRows.length === 0) {
      setAwardError("Preview a qualifying cohort before awarding.");
      return;
    }

    setAwardLoading(true);
    setAwardError(null);
    setAwardMessage(null);

    try {
      const response = await fetch("/api/admin/badges/award", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          entitlementKey: form.entitlementKey,
          memberIds: previewRows.map((row) => row.memberId),
          grantReason: form.grantReason.trim() || undefined,
          grantSource: "badge_admin_preview",
        }),
      });

      const json = (await response.json()) as AwardResponse;

      if (!response.ok || !json.ok || !json.result) {
        throw new Error(json.error || "Unable to award badge.");
      }

      setAwardMessage(
        `Awarded ${json.result.entitlementKey} to ${json.result.awarded} member${json.result.awarded === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to award badge.";
      setAwardError(message);
    } finally {
      setAwardLoading(false);
    }
  }, [form.entitlementKey, form.grantReason, previewRows]);

  React.useEffect(() => {
    if (!form.entitlementKey && sortedBadges[0]?.entitlementKey) {
      setForm((current) => ({
        ...current,
        entitlementKey: sortedBadges[0].entitlementKey,
      }));
    }
  }, [form.entitlementKey, sortedBadges]);

  return (
    <div
      style={{
        padding: embed ? "16px" : "24px",
        display: "grid",
        gap: "20px",
      }}
    >
      <div>
        <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.1 }}>Badges</h1>
        <p style={{ margin: "8px 0 0", opacity: 0.72, maxWidth: 840 }}>
          Preview and award entitlement-backed badges using live member and
          playback aggregates.
        </p>
      </div>

      <section
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 16,
          padding: 16,
          display: "grid",
          gap: 16,
        }}
      >
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          }}
        >
          <label style={{ display: "grid", gap: 6 }}>
            <span>Badge</span>
            <select
              value={form.entitlementKey}
              onChange={(event) =>
                updateForm("entitlementKey", event.target.value)
              }
            >
              {sortedBadges.map((badge) => (
                <option key={badge.entitlementKey} value={badge.entitlementKey}>
                  {badge.title} ({badge.entitlementKey})
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>Qualification mode</span>
            <select
              value={form.mode}
              onChange={(event) =>
                updateForm("mode", event.target.value as BadgePreviewMode)
              }
            >
              <option value="minutes_streamed">Total minutes streamed</option>
              <option value="play_count">Total play count</option>
              <option value="complete_count">Total complete count</option>
              <option value="joined_within_window">
                Joined within date window
              </option>
              <option value="active_within_window">
                Active within playback window
              </option>
              <option value="recording_minutes_streamed">
                Recording-specific minutes streamed
              </option>
              <option value="recording_play_count">
                Recording-specific play count
              </option>
              <option value="recording_complete_count">
                Recording-specific complete count
              </option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span>Preview limit</span>
            <input
              value={form.limit}
              onChange={(event) => updateForm("limit", event.target.value)}
              inputMode="numeric"
            />
          </label>
        </div>

        {(form.mode === "minutes_streamed" ||
          form.mode === "recording_minutes_streamed") && (
          <label style={{ display: "grid", gap: 6 }}>
            <span>Minimum minutes streamed</span>
            <input
              value={form.minMinutes}
              onChange={(event) => updateForm("minMinutes", event.target.value)}
              inputMode="numeric"
            />
          </label>
        )}

        {(form.mode === "play_count" ||
          form.mode === "recording_play_count") && (
          <label style={{ display: "grid", gap: 6 }}>
            <span>Minimum play count</span>
            <input
              value={form.minPlayCount}
              onChange={(event) =>
                updateForm("minPlayCount", event.target.value)
              }
              inputMode="numeric"
            />
          </label>
        )}

        {(form.mode === "complete_count" ||
          form.mode === "recording_complete_count") && (
          <label style={{ display: "grid", gap: 6 }}>
            <span>Minimum complete count</span>
            <input
              value={form.minCompletedCount}
              onChange={(event) =>
                updateForm("minCompletedCount", event.target.value)
              }
              inputMode="numeric"
            />
          </label>
        )}

        {form.mode === "joined_within_window" && (
          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            <label style={{ display: "grid", gap: 6 }}>
              <span>Joined on or after</span>
              <input
                type="datetime-local"
                value={form.joinedOnOrAfter}
                onChange={(event) =>
                  updateForm("joinedOnOrAfter", event.target.value)
                }
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>Joined before</span>
              <input
                type="datetime-local"
                value={form.joinedBefore}
                onChange={(event) =>
                  updateForm("joinedBefore", event.target.value)
                }
              />
            </label>
          </div>
        )}

        {form.mode === "active_within_window" && (
          <div style={{ display: "grid", gap: 12 }}>
            <div
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              }}
            >
              <label style={{ display: "grid", gap: 6 }}>
                <span>Active on or after</span>
                <input
                  type="datetime-local"
                  value={form.activeOnOrAfter}
                  onChange={(event) =>
                    updateForm("activeOnOrAfter", event.target.value)
                  }
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span>Active before</span>
                <input
                  type="datetime-local"
                  value={form.activeBefore}
                  onChange={(event) =>
                    updateForm("activeBefore", event.target.value)
                  }
                />
              </label>
            </div>

            <div
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              }}
            >
              <label style={{ display: "grid", gap: 6 }}>
                <span>Minimum play count in window</span>
                <input
                  value={form.minPlayCount}
                  onChange={(event) =>
                    updateForm("minPlayCount", event.target.value)
                  }
                  inputMode="numeric"
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span>Minimum progress count in window</span>
                <input
                  value={form.minProgressCount}
                  onChange={(event) =>
                    updateForm("minProgressCount", event.target.value)
                  }
                  inputMode="numeric"
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span>Minimum complete count in window</span>
                <input
                  value={form.minCompletedCount}
                  onChange={(event) =>
                    updateForm("minCompletedCount", event.target.value)
                  }
                  inputMode="numeric"
                />
              </label>
            </div>
          </div>
        )}

        {(form.mode === "recording_minutes_streamed" ||
          form.mode === "recording_play_count" ||
          form.mode === "recording_complete_count") && (
          <label style={{ display: "grid", gap: 6 }}>
            <span>Recording ID</span>
            <input
              value={form.recordingId}
              onChange={(event) =>
                updateForm("recordingId", event.target.value)
              }
              placeholder="recording UUID"
            />
          </label>
        )}

        <label style={{ display: "grid", gap: 6 }}>
          <span>Grant reason</span>
          <input
            value={form.grantReason}
            onChange={(event) => updateForm("grantReason", event.target.value)}
            placeholder="Optional note stored with the grant"
          />
        </label>

        {selectedBadge && (
          <div
            style={{
              padding: 12,
              borderRadius: 12,
              background: "rgba(255,255,255,0.04)",
              display: "grid",
              gap: 4,
            }}
          >
            <strong>{selectedBadge.title}</strong>
            <span style={{ opacity: 0.75 }}>
              {selectedBadge.entitlementKey}
            </span>
            {selectedBadge.description ? (
              <span style={{ opacity: 0.75 }}>{selectedBadge.description}</span>
            ) : null}
          </div>
        )}

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button type="button" onClick={runPreview} disabled={previewLoading}>
            {previewLoading ? "Previewing…" : "Preview cohort"}
          </button>

          <button
            type="button"
            onClick={runAward}
            disabled={
              awardLoading || previewLoading || previewRows.length === 0
            }
          >
            {awardLoading ? "Awarding…" : "Award badge"}
          </button>
        </div>

        {previewError ? (
          <div style={{ color: "#ff8f8f" }}>{previewError}</div>
        ) : null}

        {awardError ? (
          <div style={{ color: "#ff8f8f" }}>{awardError}</div>
        ) : null}

        {awardMessage ? (
          <div style={{ color: "#9ff0b8" }}>{awardMessage}</div>
        ) : null}
      </section>

      <section
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 16,
          padding: 16,
          display: "grid",
          gap: 12,
        }}
      >
        <div
          style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
        >
          <h2 style={{ margin: 0, fontSize: 20 }}>Preview results</h2>
          <span style={{ opacity: 0.72 }}>
            {previewCount.toLocaleString()} matching member
            {previewCount === 1 ? "" : "s"}
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 14,
            }}
          >
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px 10px" }}>
                  Member
                </th>
                <th style={{ textAlign: "left", padding: "8px 10px" }}>
                  Member ID
                </th>
                <th style={{ textAlign: "left", padding: "8px 10px" }}>
                  Joined
                </th>
                <th style={{ textAlign: "right", padding: "8px 10px" }}>
                  Minutes
                </th>
                <th style={{ textAlign: "right", padding: "8px 10px" }}>
                  Plays
                </th>
                <th style={{ textAlign: "right", padding: "8px 10px" }}>
                  Completes
                </th>
                <th style={{ textAlign: "right", padding: "8px 10px" }}>
                  Window events
                </th>
                <th style={{ textAlign: "left", padding: "8px 10px" }}>
                  Recording
                </th>
              </tr>
            </thead>
            <tbody>
              {previewRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    style={{ padding: "14px 10px", opacity: 0.7 }}
                  >
                    No preview results yet.
                  </td>
                </tr>
              ) : (
                previewRows.map((row) => (
                  <tr key={row.memberId}>
                    <td
                      style={{
                        padding: "10px",
                        borderTop: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      {row.email || row.memberId}
                    </td>
                    <td
                      style={{
                        padding: "10px",
                        borderTop: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      {row.memberId}
                    </td>
                    <td
                      style={{
                        padding: "10px",
                        borderTop: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      {formatDateTime(row.joinedAt)}
                    </td>
                    <td
                      style={{
                        padding: "10px",
                        borderTop: "1px solid rgba(255,255,255,0.08)",
                        textAlign: "right",
                      }}
                    >
                      {formatMetric(row.minutesStreamed)}
                    </td>
                    <td
                      style={{
                        padding: "10px",
                        borderTop: "1px solid rgba(255,255,255,0.08)",
                        textAlign: "right",
                      }}
                    >
                      {formatMetric(row.playCount)}
                    </td>
                    <td
                      style={{
                        padding: "10px",
                        borderTop: "1px solid rgba(255,255,255,0.08)",
                        textAlign: "right",
                      }}
                    >
                      {formatMetric(row.completedCount)}
                    </td>
                    <td
                      style={{
                        padding: "10px",
                        borderTop: "1px solid rgba(255,255,255,0.08)",
                        textAlign: "right",
                      }}
                    >
                      {formatMetric(row.matchedWindowEventCount)}
                    </td>
                    <td
                      style={{
                        padding: "10px",
                        borderTop: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      {row.matchedRecordingId || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
