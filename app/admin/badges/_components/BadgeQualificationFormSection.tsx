"use client";

import React from "react";
import {
  BADGE_PREVIEW_MODES,
  type BadgeQualificationMode,
} from "@/lib/badgePreviewModes";
import type {
  BadgeDefinitionOption,
  FormState,
  RecordingSearchResult,
  SelectedModeFieldText,
  SelectedModeInputRequirements,
} from "../_lib/badgeDashboardTypes";
import { RecordingPicker } from "./RecordingPicker";

type ModeDescriptor = {
  key: string;
  label: string;
  description: string;
  metricFamily: string;
  requiresRecording?: boolean;
  supportsDateWindow?: boolean;
};

type Props = {
  badges: BadgeDefinitionOption[];
  form: FormState;
  selectedBadge: BadgeDefinitionOption | null;
  selectedMode: ModeDescriptor | null;
  modeInputs: SelectedModeInputRequirements;
  modeFieldText: SelectedModeFieldText;
  previewLoading: boolean;
  awardLoading: boolean;
  previewRowCount: number;
  previewError: string | null;
  awardError: string | null;
  awardMessage: string | null;
  recordingQuery: string;
  recordingResults: RecordingSearchResult[];
  recordingSearchError: string | null;
  recordingSearchLoading: boolean;
  selectedRecording: RecordingSearchResult | null;
  onFormChange: <K extends keyof FormState>(
    key: K,
    value: FormState[K],
  ) => void;
  onRecordingQueryChange: (value: string) => void;
  onRunRecordingSearch: () => void;
  onSelectRecording: (recording: RecordingSearchResult) => void;
  onClearSelectedRecording: () => void;
  onRunPreview: () => void;
  onRunAward: () => void;
};

export function BadgeQualificationFormSection(props: Props) {
  const {
    badges,
    form,
    selectedBadge,
    selectedMode,
    modeInputs,
    modeFieldText,
    previewLoading,
    awardLoading,
    previewRowCount,
    previewError,
    awardError,
    awardMessage,
    recordingQuery,
    recordingResults,
    recordingSearchError,
    recordingSearchLoading,
    selectedRecording,
    onFormChange,
    onRecordingQueryChange,
    onRunRecordingSearch,
    onSelectRecording,
    onClearSelectedRecording,
    onRunPreview,
    onRunAward,
  } = props;

  return (
    <section
      style={{
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 16,
        padding: 16,
        display: "grid",
        gap: 16,
      }}
    >
      <div style={{ display: "grid", gap: 4 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Award badge</h2>
        <p style={{ margin: 0, opacity: 0.72, maxWidth: 820 }}>
          Choose a badge, define a qualifying cohort, preview matching members,
          and then execute a durable entitlement grant.
        </p>
      </div>

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
              onFormChange("entitlementKey", event.target.value)
            }
          >
            {badges.map((badge) => (
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
              onFormChange("mode", event.target.value as BadgeQualificationMode)
            }
          >
            {BADGE_PREVIEW_MODES.map((mode) => (
              <option key={mode.key} value={mode.key}>
                {mode.label}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Preview limit</span>
          <input
            value={form.limit}
            onChange={(event) => onFormChange("limit", event.target.value)}
            inputMode="numeric"
          />
        </label>
      </div>

      {selectedMode ? (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            background: "rgba(255,255,255,0.035)",
            opacity: 0.8,
            lineHeight: 1.45,
            display: "grid",
            gap: 6,
          }}
        >
          <span>{selectedMode.description}</span>
          <span style={{ fontSize: 12, opacity: 0.72 }}>
            Metric family: {selectedMode.metricFamily}
            {selectedMode.requiresRecording ? " • recording-scoped" : ""}
            {selectedMode.supportsDateWindow ? " • date-windowed" : ""}
          </span>
        </div>
      ) : null}

      {modeInputs.minMinutes ? (
        <label style={{ display: "grid", gap: 6 }}>
          <span>{modeFieldText.minMinutesLabel}</span>
          <input
            value={form.minMinutes}
            onChange={(event) => onFormChange("minMinutes", event.target.value)}
            inputMode="numeric"
          />
          {modeFieldText.minMinutesHelp ? (
            <span style={{ opacity: 0.62, fontSize: 12 }}>
              {modeFieldText.minMinutesHelp}
            </span>
          ) : null}
        </label>
      ) : null}

      {modeInputs.minPlayCount && !modeInputs.activeWindow ? (
        <label style={{ display: "grid", gap: 6 }}>
          <span>{modeFieldText.minPlayCountLabel}</span>
          <input
            value={form.minPlayCount}
            onChange={(event) =>
              onFormChange("minPlayCount", event.target.value)
            }
            inputMode="numeric"
          />
          {modeFieldText.minPlayCountHelp ? (
            <span style={{ opacity: 0.62, fontSize: 12 }}>
              {modeFieldText.minPlayCountHelp}
            </span>
          ) : null}
        </label>
      ) : null}

      {modeInputs.minCompletedCount && !modeInputs.activeWindow ? (
        <label style={{ display: "grid", gap: 6 }}>
          <span>{modeFieldText.minCompletedCountLabel}</span>
          <input
            value={form.minCompletedCount}
            onChange={(event) =>
              onFormChange("minCompletedCount", event.target.value)
            }
            inputMode="numeric"
          />
          {modeFieldText.minCompletedCountHelp ? (
            <span style={{ opacity: 0.62, fontSize: 12 }}>
              {modeFieldText.minCompletedCountHelp}
            </span>
          ) : null}
        </label>
      ) : null}

      {modeInputs.minContributionCount ? (
        <label style={{ display: "grid", gap: 6 }}>
          <span>{modeFieldText.minContributionCountLabel}</span>
          <input
            value={form.minContributionCount}
            onChange={(event) =>
              onFormChange("minContributionCount", event.target.value)
            }
            inputMode="numeric"
          />
          {modeFieldText.minContributionCountHelp ? (
            <span style={{ opacity: 0.62, fontSize: 12 }}>
              {modeFieldText.minContributionCountHelp}
            </span>
          ) : null}
        </label>
      ) : null}

      {modeInputs.minVoteCount ? (
        <label style={{ display: "grid", gap: 6 }}>
          <span>{modeFieldText.minVoteCountLabel}</span>
          <input
            value={form.minVoteCount}
            onChange={(event) =>
              onFormChange("minVoteCount", event.target.value)
            }
            inputMode="numeric"
          />
          {modeFieldText.minVoteCountHelp ? (
            <span style={{ opacity: 0.62, fontSize: 12 }}>
              {modeFieldText.minVoteCountHelp}
            </span>
          ) : null}
        </label>
      ) : null}

      {modeInputs.joinedWindow ? (
        <div style={{ display: "grid", gap: 12 }}>
          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            <label style={{ display: "grid", gap: 6 }}>
              <span>{modeFieldText.joinedOnOrAfterLabel}</span>
              <input
                type="datetime-local"
                value={form.joinedOnOrAfter}
                onChange={(event) =>
                  onFormChange("joinedOnOrAfter", event.target.value)
                }
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>{modeFieldText.joinedBeforeLabel}</span>
              <input
                type="datetime-local"
                value={form.joinedBefore}
                onChange={(event) =>
                  onFormChange("joinedBefore", event.target.value)
                }
              />
            </label>
          </div>

          {modeFieldText.joinedWindowHelp ? (
            <span style={{ opacity: 0.62, fontSize: 12 }}>
              {modeFieldText.joinedWindowHelp}
            </span>
          ) : null}
        </div>
      ) : null}

      {modeInputs.activeWindow ? (
        <div style={{ display: "grid", gap: 12 }}>
          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            <label style={{ display: "grid", gap: 6 }}>
              <span>{modeFieldText.activeOnOrAfterLabel}</span>
              <input
                type="datetime-local"
                value={form.activeOnOrAfter}
                onChange={(event) =>
                  onFormChange("activeOnOrAfter", event.target.value)
                }
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>{modeFieldText.activeBeforeLabel}</span>
              <input
                type="datetime-local"
                value={form.activeBefore}
                onChange={(event) =>
                  onFormChange("activeBefore", event.target.value)
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
              <span>{modeFieldText.minPlayCountLabel}</span>
              <input
                value={form.minPlayCount}
                onChange={(event) =>
                  onFormChange("minPlayCount", event.target.value)
                }
                inputMode="numeric"
              />
              {modeFieldText.minPlayCountHelp ? (
                <span style={{ opacity: 0.62, fontSize: 12 }}>
                  {modeFieldText.minPlayCountHelp}
                </span>
              ) : null}
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>{modeFieldText.minProgressCountLabel}</span>
              <input
                value={form.minProgressCount}
                onChange={(event) =>
                  onFormChange("minProgressCount", event.target.value)
                }
                inputMode="numeric"
              />
              {modeFieldText.minProgressCountHelp ? (
                <span style={{ opacity: 0.62, fontSize: 12 }}>
                  {modeFieldText.minProgressCountHelp}
                </span>
              ) : null}
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>{modeFieldText.minCompletedCountLabel}</span>
              <input
                value={form.minCompletedCount}
                onChange={(event) =>
                  onFormChange("minCompletedCount", event.target.value)
                }
                inputMode="numeric"
              />
              {modeFieldText.minCompletedCountHelp ? (
                <span style={{ opacity: 0.62, fontSize: 12 }}>
                  {modeFieldText.minCompletedCountHelp}
                </span>
              ) : null}
            </label>
          </div>

          {modeFieldText.activeWindowHelp ? (
            <span style={{ opacity: 0.62, fontSize: 12 }}>
              {modeFieldText.activeWindowHelp}
            </span>
          ) : null}
        </div>
      ) : null}

      {modeInputs.recordingId ? (
        <RecordingPicker
          label={modeFieldText.recordingIdLabel}
          helpText={modeFieldText.recordingIdHelp}
          query={recordingQuery}
          results={recordingResults}
          error={recordingSearchError}
          loading={recordingSearchLoading}
          selectedRecording={selectedRecording}
          selectedRecordingId={form.recordingId}
          onQueryChange={onRecordingQueryChange}
          onRunSearch={onRunRecordingSearch}
          onSelectRecording={onSelectRecording}
          onClearSelectedRecording={onClearSelectedRecording}
        />
      ) : null}

      <label style={{ display: "grid", gap: 6 }}>
        <span>Grant reason</span>
        <input
          value={form.grantReason}
          onChange={(event) => onFormChange("grantReason", event.target.value)}
          placeholder="Optional note stored with the grant"
        />
      </label>

      {selectedBadge ? (
        <div
          style={{
            padding: 12,
            borderRadius: 12,
            background: "rgba(255,255,255,0.04)",
            display: "grid",
            gap: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              alignItems: "flex-start",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "grid", gap: 4 }}>
              <strong>{selectedBadge.title}</strong>
              <span style={{ opacity: 0.75 }}>
                {selectedBadge.entitlementKey}
              </span>
            </div>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {selectedBadge.featured ? (
                <span
                  style={{
                    fontSize: 11,
                    padding: "3px 7px",
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.08)",
                    opacity: 0.85,
                  }}
                >
                  Featured
                </span>
              ) : null}

              {selectedBadge.shareable ? (
                <span
                  style={{
                    fontSize: 11,
                    padding: "3px 7px",
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.08)",
                    opacity: 0.85,
                  }}
                >
                  Shareable
                </span>
              ) : null}
            </div>
          </div>

          {selectedBadge.description ? (
            <span style={{ opacity: 0.75 }}>{selectedBadge.description}</span>
          ) : null}

          <span style={{ opacity: 0.58, fontSize: 12 }}>
            Display order {selectedBadge.displayOrder}
            {selectedBadge.imageUrl ? " • image present" : " • no image"}
          </span>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button type="button" onClick={onRunPreview} disabled={previewLoading}>
          {previewLoading ? "Previewing…" : "Preview cohort"}
        </button>

        <button
          type="button"
          onClick={onRunAward}
          disabled={awardLoading || previewLoading || previewRowCount === 0}
        >
          {awardLoading ? "Awarding…" : "Award badge"}
        </button>
      </div>

      {previewError ? (
        <div style={{ color: "#ff8f8f" }}>{previewError}</div>
      ) : null}
      {awardError ? <div style={{ color: "#ff8f8f" }}>{awardError}</div> : null}
      {awardMessage ? (
        <div style={{ color: "#9ff0b8" }}>{awardMessage}</div>
      ) : null}
    </section>
  );
}
