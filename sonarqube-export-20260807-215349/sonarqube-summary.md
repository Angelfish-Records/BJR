# SonarQube Cloud unresolved-findings export

- **Project:** `Angelfish-Records_BJR`
- **Branch:** `main`
- **Exported:** 2026-08-07T09:54:35.171863Z
- **Quality Gate:** OK
- **Unresolved issues:** 620
- **Security Hotspots awaiting review:** 0

## Recommended working order

1. Review Security Hotspots with HIGH probability first; determine whether each is safe or requires a code change.
2. Fix BLOCKER and CRITICAL security/reliability impacts, then MAJOR impacts.
3. Group repeated findings by rule and fix one pattern at a time, with tests after each batch.
4. Work file-by-file only after the high-impact and high-frequency rule clusters are understood.

## Issues by software quality

| Value | Count |
|---|---:|
| MAINTAINABILITY | 576 |
| RELIABILITY | 79 |

## Issues by impact severity

| Value | Count |
|---|---:|
| LOW | 347 |
| MEDIUM | 232 |
| HIGH | 65 |

## Most frequent issue rules

| Value | Count |
|---|---:|
| typescript:S6759 — React props should be read-only | 139 |
| typescript:S3358 — Ternary operators should not be nested | 87 |
| typescript:S3776 — Cognitive Complexity of functions should not be too high | 61 |
| typescript:S9011 — "<button>" elements should have an explicit "type" attribute | 36 |
| typescript:S6582 — Optional chaining should be preferred | 35 |
| typescript:S6571 — Type constituents of unions and intersections should not be redundant | 26 |
| typescript:S7772 — Node.js built-in modules should be imported using the "node:" protocol | 16 |
| typescript:S6819 — Prefer tag over ARIA role | 14 |
| typescript:S4624 — Template literals should not be nested | 14 |
| typescript:S6606 — Nullish coalescing should be preferred | 11 |
| typescript:S6644 — Ternary operator should not be used instead of simpler alternatives | 10 |
| typescript:S7744 — Unnecessary fallback objects should not be used when spreading in object literals | 9 |
| typescript:S1874 — Deprecated APIs should not be used | 9 |
| typescript:S7773 — Number static methods and properties should be preferred over global equivalents | 8 |
| typescript:S6353 — Regular expression quantifiers and character classes should be used concisely | 8 |
| typescript:S7755 — Complex index access patterns should be replaced with ".at()" method | 7 |
| typescript:S6767 — Unused React typed props should be removed | 7 |
| typescript:S6653 — Use Object.hasOwn static method instead of hasOwnProperty | 6 |
| typescript:S6847 — Non-interactive elements shouldn't have event handlers | 6 |
| typescript:S7741 — "typeof" should not be used to check for "undefined" | 6 |
| typescript:S7781 — Strings should use "replaceAll()" instead of "replace()" with global regex | 6 |
| typescript:S7766 — Ternary expressions should be replaced with "Math.min()" or "Math.max()" for simple comparisons | 6 |
| typescript:S6772 — Spacing between inline elements should be explicit | 6 |
| typescript:S6551 — Objects and classes converted or coerced to strings should define a "toString()" method | 6 |
| typescript:S6825 — Focusable elements should not have "aria-hidden" attribute | 5 |
| typescript:S4144 — Functions should not have identical implementations | 5 |
| typescript:S7758 — Unicode-aware string methods should be used for proper character handling | 5 |
| typescript:S6594 — "RegExp.exec()" should be preferred over "String.match()" | 4 |
| typescript:S4782 — Optional property declarations should not use both '?' and 'undefined' syntax | 4 |
| typescript:S2933 — Fields that are only assigned in the constructor should be "readonly" | 4 |

## Files with the most issues

| Value | Count |
|---|---:|
| app/admin/campaigns/CampaignComposerClient.tsx | 38 |
| app/admin/exegesis/ExegesisGroupTool.tsx | 29 |
| app/home/player/PlayerState.tsx | 20 |
| app/home/player/FullPlayer.tsx | 18 |
| app/home/player/AudioEngine.tsx | 17 |
| app/home/player/VisualizerPattern.tsx | 16 |
| app/home/PortalModules.tsx | 16 |
| sanity/components/LyricsImportInput.tsx | 16 |
| app/home/modules/PortalExegesis.tsx | 13 |
| lib/events.ts | 13 |
| app/home/modules/PortalArtistPostsToolbar.tsx | 9 |
| app/(site)/exegesis/[displayId]/hooks/useExegesisThread.ts | 9 |
| app/home/player/stage/LyricsOverlay.tsx | 9 |
| app/home/player/visualizer/VisualizerEngine.ts | 8 |
| app/(site)/exegesis/[displayId]/components/ExegesisCommentItem.tsx | 8 |
| app/internal/render/visualizer/VisualizerLivePreview.tsx | 7 |
| app/home/modules/usePortalArtistPostsController.ts | 7 |
| app/(site)/exegesis/[displayId]/components/ExegesisDiscoursePanel.tsx | 7 |
| app/home/SessionChrome.tsx | 6 |
| app/home/modules/BuyAlbumButton.tsx | 6 |
| app/(site)/exegesis/[displayId]/TipTapEditor.tsx | 6 |
| app/home/badges/BadgeAwardOverlay.tsx | 5 |
| app/home/modules/MailbagFeedbackForm.tsx | 5 |
| lib/unsubscribe.ts | 5 |
| app/home/modules/PortalArtistPosts.tsx | 5 |
| app/home/modules/PortalArtistPostItem.tsx | 5 |
| app/admin/badges/_components/BadgeQualificationFormSection.tsx | 5 |
| app/admin/playback/dashboard/PlaybackDashboardPrimitives.tsx | 5 |
| app/admin/exegesis/ExegesisModerator.tsx | 5 |
| app/home/gating/GateSpotlightOverlay.tsx | 5 |

## Hotspots by review probability

| Value | Count |
|---|---:|
| No data | 0 |

## Hotspots by security category

| Value | Count |
|---|---:|
| No data | 0 |

## Assistant hand-off

Give the assistant `sonarqube-assistant-bundle.json` together with access to the repository. A useful first instruction is:

> Analyse this SonarQube export against the repository. Build a remediation plan ordered by security/reliability impact, then by repeated rule clusters. For each batch, name the affected files, explain the root pattern, propose the smallest safe changes, identify tests to run, and do not mark a finding complete until the relevant tests pass.

The CSV files are intended for sorting and progress tracking. The raw JSON files preserve API fields that the normalised bundle may not surface explicitly.
