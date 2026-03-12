"use client";

import React from "react";
import { BADGE_PREVIEW_MODES } from "@/lib/badgePreviewModes";
import AdminPageFrame from "../AdminPageFrame";
import { BadgeCatalogueSection } from "./_components/BadgeCatalogueSection";
import { BadgeQualificationFormSection } from "./_components/BadgeQualificationFormSection";
import { PreviewResultsSection } from "./_components/PreviewResultsSection";
import { MetricPill } from "../playback/dashboard/PlaybackDashboardPrimitives";
import {
  FONT_SIZE_UI,
  TEXT_MUTED,
  TEXT_PRIMARY,
} from "../playback/dashboard/playbackTelemetryDashboardStyles";
import type {
  AwardResponse,
  BadgeDefinitionOption,
  FormState,
  PreviewResponse,
  PreviewRow,
  Props,
  RecordingSearchResponse,
  RecordingSearchResult,
} from "./_lib/badgeDashboardTypes";
import {
  buildPreviewPayload,
  DEFAULT_FORM_STATE,
} from "./_lib/badgeDashboardUtils";

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

  const [recordingQuery, setRecordingQuery] = React.useState("");
  const [recordingResults, setRecordingResults] = React.useState<
    RecordingSearchResult[]
  >([]);
  const [recordingSearchError, setRecordingSearchError] = React.useState<
    string | null
  >(null);
  const [recordingSearchLoading, setRecordingSearchLoading] =
    React.useState(false);
  const [selectedRecording, setSelectedRecording] =
    React.useState<RecordingSearchResult | null>(null);

  const selectedBadge = React.useMemo(() => {
    return (
      sortedBadges.find(
        (badge: BadgeDefinitionOption) =>
          badge.entitlementKey === form.entitlementKey,
      ) ?? null
    );
  }, [form.entitlementKey, sortedBadges]);

  const selectedMode = React.useMemo(() => {
    return BADGE_PREVIEW_MODES.find((mode) => mode.key === form.mode) ?? null;
  }, [form.mode]);

  const modeInputs = selectedMode?.inputRequirements ?? {
    minMinutes: false,
    minPlayCount: false,
    minCompletedCount: false,
    minProgressCount: false,
    minContributionCount: false,
    minVoteCount: false,
    joinedWindow: false,
    activeWindow: false,
    recordingId: false,
  };

  const modeFieldText = selectedMode?.fieldText ?? {
    minMinutesLabel: "Minimum minutes streamed",
    minMinutesHelp: null,
    minPlayCountLabel: "Minimum play count",
    minPlayCountHelp: null,
    minCompletedCountLabel: "Minimum complete count",
    minCompletedCountHelp: null,
    minProgressCountLabel: "Minimum progress count",
    minProgressCountHelp: null,
    minContributionCountLabel: "Minimum Exegesis contributions",
    minContributionCountHelp: null,
    minVoteCountLabel: "Minimum cumulative vote tally",
    minVoteCountHelp: null,
    joinedOnOrAfterLabel: "Joined on or after",
    joinedBeforeLabel: "Joined before",
    joinedWindowHelp: null,
    activeOnOrAfterLabel: "Active on or after",
    activeBeforeLabel: "Active before",
    activeWindowHelp: null,
    recordingIdLabel: "Recording ID",
    recordingIdPlaceholder: "recording UUID",
    recordingIdHelp: null,
  };

  const updateForm = React.useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((current) => ({
        ...current,
        [key]: value,
      }));
    },
    [],
  );

  const runRecordingSearch = React.useCallback(async () => {
    const query = recordingQuery.trim();

    if (!query) {
      setRecordingResults([]);
      setRecordingSearchError(
        "Enter a track title, artist, album, or recording ID.",
      );
      return;
    }

    setRecordingSearchLoading(true);
    setRecordingSearchError(null);

    try {
      const params = new URLSearchParams({
        q: query,
        limit: "12",
      });

      const response = await fetch(
        `/api/admin/recordings/search?${params.toString()}`,
        {
          method: "GET",
        },
      );

      const json = (await response.json()) as RecordingSearchResponse;

      if (!response.ok || !json.ok) {
        throw new Error(json.error || "Unable to search recordings.");
      }

      const results = Array.isArray(json.results) ? json.results : [];
      setRecordingResults(results);

      if (results.length === 0) {
        setRecordingSearchError("No recordings matched that search.");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to search recordings.";
      setRecordingResults([]);
      setRecordingSearchError(message);
    } finally {
      setRecordingSearchLoading(false);
    }
  }, [recordingQuery]);

  const selectRecording = React.useCallback(
    (recording: RecordingSearchResult) => {
      setSelectedRecording(recording);
      setRecordingQuery(
        [recording.title, recording.artist, recording.albumTitle]
          .filter((value): value is string => Boolean(value && value.trim()))
          .join(" • "),
      );
      setRecordingResults([]);
      setRecordingSearchError(null);
      updateForm("recordingId", recording.recordingId);
    },
    [updateForm],
  );

  const clearSelectedRecording = React.useCallback(() => {
    setSelectedRecording(null);
    setRecordingResults([]);
    setRecordingSearchError(null);
    setRecordingQuery("");
    updateForm("recordingId", "");
  }, [updateForm]);

  const runPreview = React.useCallback(async () => {
    if (modeInputs.recordingId && !form.recordingId.trim()) {
      setPreviewError(
        "Select a recording before previewing this badge cohort.",
      );
      setAwardError(null);
      setAwardMessage(null);
      return;
    }

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
  }, [form, modeInputs.recordingId]);

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

      const { entitlementKey, attempted, inserted, alreadyHeld } = json.result;

      if (inserted === attempted) {
        setAwardMessage(
          `Awarded ${entitlementKey} to ${inserted} member${inserted === 1 ? "" : "s"}.`,
        );
      } else if (inserted === 0 && alreadyHeld > 0) {
        setAwardMessage(
          `No new grants were created. ${alreadyHeld} member${alreadyHeld === 1 ? "" : "s"} already held ${entitlementKey}.`,
        );
      } else {
        setAwardMessage(
          `Processed ${attempted} member${attempted === 1 ? "" : "s"} for ${entitlementKey}: ${inserted} new grant${inserted === 1 ? "" : "s"}, ${alreadyHeld} already held.`,
        );
      }
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

  React.useEffect(() => {
    if (!modeInputs.recordingId && form.recordingId) {
      setSelectedRecording(null);
      setRecordingResults([]);
      setRecordingSearchError(null);
      setRecordingQuery("");
      setForm((current) => ({
        ...current,
        recordingId: "",
      }));
    }
  }, [form.recordingId, modeInputs.recordingId]);

  const selectedModeLabel = selectedMode?.label ?? "—";
  const selectedBadgeLabel = selectedBadge?.title ?? "—";

  const headerActions = (
    <>
      <button
        type="button"
        onClick={() => void runPreview()}
        disabled={previewLoading}
        style={{
          height: 30,
          padding: "0 12px",
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(255,255,255,0.04)",
          color: TEXT_PRIMARY,
          cursor: previewLoading ? "default" : "pointer",
          fontSize: FONT_SIZE_UI,
          fontWeight: 700,
          opacity: previewLoading ? 0.72 : 1,
        }}
      >
        {previewLoading ? "Previewing…" : "Preview cohort"}
      </button>

      <button
        type="button"
        onClick={() => void runAward()}
        disabled={awardLoading || previewLoading || previewRows.length === 0}
        style={{
          height: 30,
          padding: "0 12px",
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.14)",
          background:
            awardLoading || previewLoading || previewRows.length === 0
              ? "rgba(255,255,255,0.04)"
              : "rgba(255,255,255,0.10)",
          color: TEXT_PRIMARY,
          cursor:
            awardLoading || previewLoading || previewRows.length === 0
              ? "default"
              : "pointer",
          fontSize: FONT_SIZE_UI,
          fontWeight: 700,
          opacity:
            awardLoading || previewLoading || previewRows.length === 0
              ? 0.72
              : 1,
        }}
      >
        {awardLoading ? "Awarding…" : "Award badge"}
      </button>
    </>
  );

  return (
    <AdminPageFrame
      embed={embed}
      maxWidth={1360}
      title="Badge dashboard"
      subtitle="Preview and award entitlement-backed badges using live member and playback aggregates."
      headerActions={headerActions}
    >
      <div
        style={{
          display: "grid",
          gap: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <MetricPill
              label="Active badges"
              value={sortedBadges.length.toLocaleString()}
            />
            <MetricPill label="Selected badge" value={selectedBadgeLabel} />
            <MetricPill label="Qualification mode" value={selectedModeLabel} />
            <MetricPill
              label="Preview matches"
              value={previewCount.toLocaleString()}
            />
          </div>

          <div
            style={{
              fontSize: FONT_SIZE_UI,
              lineHeight: 1.5,
              color: TEXT_MUTED,
            }}
          >
            {selectedBadge ? (
              <>
                Targeting{" "}
                <span style={{ color: TEXT_PRIMARY }}>
                  {selectedBadge.entitlementKey}
                </span>
              </>
            ) : (
              "No badge selected"
            )}
          </div>
        </div>

        <BadgeCatalogueSection
          badges={sortedBadges}
          selectedEntitlementKey={form.entitlementKey}
          onSelectEntitlementKey={(entitlementKey) =>
            updateForm("entitlementKey", entitlementKey)
          }
        />

        <BadgeQualificationFormSection
          badges={sortedBadges}
          form={form}
          selectedBadge={selectedBadge}
          selectedMode={selectedMode}
          modeInputs={modeInputs}
          modeFieldText={modeFieldText}
          previewLoading={previewLoading}
          awardLoading={awardLoading}
          previewRowCount={previewRows.length}
          previewError={previewError}
          awardError={awardError}
          awardMessage={awardMessage}
          recordingQuery={recordingQuery}
          recordingResults={recordingResults}
          recordingSearchError={recordingSearchError}
          recordingSearchLoading={recordingSearchLoading}
          selectedRecording={selectedRecording}
          onFormChange={updateForm}
          onRecordingQueryChange={setRecordingQuery}
          onRunRecordingSearch={() => void runRecordingSearch()}
          onSelectRecording={selectRecording}
          onClearSelectedRecording={clearSelectedRecording}
          onRunPreview={() => void runPreview()}
          onRunAward={() => void runAward()}
        />

        <PreviewResultsSection rows={previewRows} count={previewCount} />
      </div>
    </AdminPageFrame>
  );
}
