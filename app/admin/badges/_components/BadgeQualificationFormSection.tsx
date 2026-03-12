// web/app/admin/badges/_components/BadgeQualificationFormSection.tsx
"use client";

import React from "react";
import {
  BADGE_PREVIEW_MODES,
  type BadgeQualificationMode,
} from "@/lib/badgePreviewModes";
import {
  BG_INSET,
  FONT_SIZE_UI,
  PANEL_BORDER,
  TEXT_MUTED,
  TEXT_PRIMARY,
} from "../../playback/dashboard/playbackTelemetryDashboardStyles";
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

const labelTextStyle: React.CSSProperties = {
  fontSize: FONT_SIZE_UI,
  lineHeight: 1.4,
  color: TEXT_PRIMARY,
  fontWeight: 700,
};

const helpTextStyle: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.45,
  color: TEXT_MUTED,
};

const controlStyle: React.CSSProperties = {
  width: "100%",
  height: 38,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.04)",
  color: TEXT_PRIMARY,
  padding: "0 12px",
  fontSize: FONT_SIZE_UI,
  outline: "none",
};

const actionButtonBaseStyle: React.CSSProperties = {
  height: 32,
  padding: "0 12px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.14)",
  color: TEXT_PRIMARY,
  fontSize: FONT_SIZE_UI,
  fontWeight: 700,
};

function Field(props: {
  label: string;
  helpText?: string | null;
  children: React.ReactNode;
}) {
  const { label, helpText, children } = props;

  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={labelTextStyle}>{label}</span>
      {children}
      {helpText ? <span style={helpTextStyle}>{helpText}</span> : null}
    </label>
  );
}

export function BadgeQualificationFormSection(props: Props) {
  const {
    badges,
    form,
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
        border: PANEL_BORDER,
        borderRadius: 18,
        background: BG_INSET,
        padding: 16,
        display: "grid",
        gap: 16,
      }}
    >
      <div style={{ display: "grid", gap: 4 }}>
        <h2
          style={{
            margin: 0,
            fontSize: 18,
            lineHeight: 1.15,
            color: TEXT_PRIMARY,
          }}
        >
          Award badge
        </h2>
        <p
          style={{
            margin: 0,
            maxWidth: 820,
            fontSize: FONT_SIZE_UI,
            lineHeight: 1.5,
            color: TEXT_MUTED,
          }}
        >
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
        <Field label="Badge">
          <select
            value={form.entitlementKey}
            onChange={(event) =>
              onFormChange("entitlementKey", event.target.value)
            }
            style={controlStyle}
          >
            {badges.map((badge) => (
              <option key={badge.entitlementKey} value={badge.entitlementKey}>
                {badge.title} ({badge.entitlementKey})
              </option>
            ))}
          </select>
        </Field>

        <Field label="Qualification mode">
          <select
            value={form.mode}
            onChange={(event) =>
              onFormChange("mode", event.target.value as BadgeQualificationMode)
            }
            style={controlStyle}
          >
            {BADGE_PREVIEW_MODES.map((mode) => (
              <option key={mode.key} value={mode.key}>
                {mode.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {modeInputs.minMinutes ? (
        <Field
          label={modeFieldText.minMinutesLabel}
          helpText={modeFieldText.minMinutesHelp}
        >
          <input
            value={form.minMinutes}
            onChange={(event) => onFormChange("minMinutes", event.target.value)}
            inputMode="numeric"
            style={controlStyle}
          />
        </Field>
      ) : null}

      {modeInputs.minPlayCount && !modeInputs.activeWindow ? (
        <Field
          label={modeFieldText.minPlayCountLabel}
          helpText={modeFieldText.minPlayCountHelp}
        >
          <input
            value={form.minPlayCount}
            onChange={(event) =>
              onFormChange("minPlayCount", event.target.value)
            }
            inputMode="numeric"
            style={controlStyle}
          />
        </Field>
      ) : null}

      {modeInputs.minCompletedCount && !modeInputs.activeWindow ? (
        <Field
          label={modeFieldText.minCompletedCountLabel}
          helpText={modeFieldText.minCompletedCountHelp}
        >
          <input
            value={form.minCompletedCount}
            onChange={(event) =>
              onFormChange("minCompletedCount", event.target.value)
            }
            inputMode="numeric"
            style={controlStyle}
          />
        </Field>
      ) : null}

      {modeInputs.minContributionCount ? (
        <Field
          label={modeFieldText.minContributionCountLabel}
          helpText={modeFieldText.minContributionCountHelp}
        >
          <input
            value={form.minContributionCount}
            onChange={(event) =>
              onFormChange("minContributionCount", event.target.value)
            }
            inputMode="numeric"
            style={controlStyle}
          />
        </Field>
      ) : null}

      {modeInputs.minVoteCount ? (
        <Field
          label={modeFieldText.minVoteCountLabel}
          helpText={modeFieldText.minVoteCountHelp}
        >
          <input
            value={form.minVoteCount}
            onChange={(event) =>
              onFormChange("minVoteCount", event.target.value)
            }
            inputMode="numeric"
            style={controlStyle}
          />
        </Field>
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
            <Field label={modeFieldText.joinedOnOrAfterLabel}>
              <input
                type="datetime-local"
                value={form.joinedOnOrAfter}
                onChange={(event) =>
                  onFormChange("joinedOnOrAfter", event.target.value)
                }
                style={controlStyle}
              />
            </Field>

            <Field label={modeFieldText.joinedBeforeLabel}>
              <input
                type="datetime-local"
                value={form.joinedBefore}
                onChange={(event) =>
                  onFormChange("joinedBefore", event.target.value)
                }
                style={controlStyle}
              />
            </Field>
          </div>

          {modeFieldText.joinedWindowHelp ? (
            <span style={helpTextStyle}>{modeFieldText.joinedWindowHelp}</span>
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
            <Field label={modeFieldText.activeOnOrAfterLabel}>
              <input
                type="datetime-local"
                value={form.activeOnOrAfter}
                onChange={(event) =>
                  onFormChange("activeOnOrAfter", event.target.value)
                }
                style={controlStyle}
              />
            </Field>

            <Field label={modeFieldText.activeBeforeLabel}>
              <input
                type="datetime-local"
                value={form.activeBefore}
                onChange={(event) =>
                  onFormChange("activeBefore", event.target.value)
                }
                style={controlStyle}
              />
            </Field>
          </div>

          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            <Field
              label={modeFieldText.minPlayCountLabel}
              helpText={modeFieldText.minPlayCountHelp}
            >
              <input
                value={form.minPlayCount}
                onChange={(event) =>
                  onFormChange("minPlayCount", event.target.value)
                }
                inputMode="numeric"
                style={controlStyle}
              />
            </Field>

            <Field
              label={modeFieldText.minProgressCountLabel}
              helpText={modeFieldText.minProgressCountHelp}
            >
              <input
                value={form.minProgressCount}
                onChange={(event) =>
                  onFormChange("minProgressCount", event.target.value)
                }
                inputMode="numeric"
                style={controlStyle}
              />
            </Field>

            <Field
              label={modeFieldText.minCompletedCountLabel}
              helpText={modeFieldText.minCompletedCountHelp}
            >
              <input
                value={form.minCompletedCount}
                onChange={(event) =>
                  onFormChange("minCompletedCount", event.target.value)
                }
                inputMode="numeric"
                style={controlStyle}
              />
            </Field>
          </div>

          {modeFieldText.activeWindowHelp ? (
            <span style={helpTextStyle}>{modeFieldText.activeWindowHelp}</span>
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

      <Field label="Grant reason">
        <input
          value={form.grantReason}
          onChange={(event) => onFormChange("grantReason", event.target.value)}
          placeholder="Optional note stored with the grant"
          style={controlStyle}
        />
      </Field>
      <Field label="Preview limit">
        <input
          value={form.limit}
          onChange={(event) => onFormChange("limit", event.target.value)}
          inputMode="numeric"
          style={controlStyle}
        />
      </Field>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onRunPreview}
          disabled={previewLoading}
          style={{
            ...actionButtonBaseStyle,
            background: "rgba(255,255,255,0.04)",
            cursor: previewLoading ? "default" : "pointer",
            opacity: previewLoading ? 0.72 : 1,
          }}
        >
          {previewLoading ? "Previewing…" : "Preview cohort"}
        </button>

        <button
          type="button"
          onClick={onRunAward}
          disabled={awardLoading || previewLoading || previewRowCount === 0}
          style={{
            ...actionButtonBaseStyle,
            background:
              awardLoading || previewLoading || previewRowCount === 0
                ? "rgba(255,255,255,0.04)"
                : "rgba(255,255,255,0.10)",
            cursor:
              awardLoading || previewLoading || previewRowCount === 0
                ? "default"
                : "pointer",
            opacity:
              awardLoading || previewLoading || previewRowCount === 0
                ? 0.72
                : 1,
          }}
        >
          {awardLoading ? "Awarding…" : "Award badge"}
        </button>
      </div>

      {previewError ? (
        <div
          style={{
            borderRadius: 12,
            border: "1px solid rgba(255,143,143,0.22)",
            background: "rgba(255,143,143,0.08)",
            padding: "10px 12px",
            color: "#ffb1b1",
            fontSize: FONT_SIZE_UI,
            lineHeight: 1.5,
          }}
        >
          {previewError}
        </div>
      ) : null}

      {awardError ? (
        <div
          style={{
            borderRadius: 12,
            border: "1px solid rgba(255,143,143,0.22)",
            background: "rgba(255,143,143,0.08)",
            padding: "10px 12px",
            color: "#ffb1b1",
            fontSize: FONT_SIZE_UI,
            lineHeight: 1.5,
          }}
        >
          {awardError}
        </div>
      ) : null}

      {awardMessage ? (
        <div
          style={{
            borderRadius: 12,
            border: "1px solid rgba(159,240,184,0.22)",
            background: "rgba(159,240,184,0.08)",
            padding: "10px 12px",
            color: "#baf4ca",
            fontSize: FONT_SIZE_UI,
            lineHeight: 1.5,
          }}
        >
          {awardMessage}
        </div>
      ) : null}
    </section>
  );
}
