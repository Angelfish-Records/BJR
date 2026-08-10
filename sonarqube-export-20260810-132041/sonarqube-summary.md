# SonarQube Cloud unresolved-findings export

- **Project:** `Angelfish-Records_BJR`
- **Branch:** `main`
- **Exported:** 2026-08-10T01:21:12.138843Z
- **Quality Gate:** OK
- **Unresolved issues:** 300
- **Security Hotspots awaiting review:** 0

## Recommended working order

1. Review Security Hotspots with HIGH probability first; determine whether each is safe or requires a code change.
2. Fix BLOCKER and CRITICAL security/reliability impacts, then MAJOR impacts.
3. Group repeated findings by rule and fix one pattern at a time, with tests after each batch.
4. Work file-by-file only after the high-impact and high-frequency rule clusters are understood.

## Issues by software quality

| Value | Count |
|---|---:|
| MAINTAINABILITY | 286 |
| RELIABILITY | 35 |

## Issues by impact severity

| Value | Count |
|---|---:|
| LOW | 186 |
| MEDIUM | 110 |
| HIGH | 20 |

## Most frequent issue rules

| Value | Count |
|---|---:|
| typescript:S6759 — React props should be read-only | 87 |
| typescript:S3358 — Ternary operators should not be nested | 37 |
| typescript:S3776 — Cognitive Complexity of functions should not be too high | 18 |
| typescript:S6582 — Optional chaining should be preferred | 17 |
| typescript:S6571 — Type constituents of unions and intersections should not be redundant | 14 |
| typescript:S7772 — Node.js built-in modules should be imported using the "node:" protocol | 12 |
| typescript:S6819 — Prefer tag over ARIA role | 8 |
| typescript:S9011 — "<button>" elements should have an explicit "type" attribute | 7 |
| typescript:S6847 — Non-interactive elements shouldn't have event handlers | 6 |
| typescript:S7744 — Unnecessary fallback objects should not be used when spreading in object literals | 5 |
| typescript:S7773 — Number static methods and properties should be preferred over global equivalents | 5 |
| typescript:S6551 — Objects and classes converted or coerced to strings should define a "toString()" method | 5 |
| typescript:S7755 — Complex index access patterns should be replaced with ".at()" method | 4 |
| typescript:S6825 — Focusable elements should not have "aria-hidden" attribute | 4 |
| typescript:S6772 — Spacing between inline elements should be explicit | 4 |
| typescript:S4144 — Functions should not have identical implementations | 4 |
| typescript:S6644 — Ternary operator should not be used instead of simpler alternatives | 4 |
| typescript:S7780 — String literals with escaped backslashes should use `String.raw` template literals | 3 |
| typescript:S6754 — The return value of "useState" should be destructured and named symmetrically | 3 |
| typescript:S7741 — "typeof" should not be used to check for "undefined" | 3 |
| typescript:S4084 — Media elements should have captions | 3 |
| typescript:S7758 — Unicode-aware string methods should be used for proper character handling | 3 |
| typescript:S6594 — "RegExp.exec()" should be preferred over "String.match()" | 3 |
| typescript:S7763 — Re-exports should use "export...from" syntax | 3 |
| typescript:S6564 — Redundant type aliases should not be used | 3 |
| typescript:S4624 — Template literals should not be nested | 3 |
| typescript:S2933 — Fields that are only assigned in the constructor should be "readonly" | 3 |
| typescript:S6653 — Use Object.hasOwn static method instead of hasOwnProperty | 2 |
| typescript:S107 — Functions should not have too many parameters | 2 |
| css:S4666 — Selectors should not be duplicated | 2 |

## Files with the most issues

| Value | Count |
|---|---:|
| app/home/player/VisualizerPattern.tsx | 16 |
| app/internal/render/visualizer/VisualizerLivePreview.tsx | 7 |
| app/home/SessionChrome.tsx | 6 |
| app/home/modules/BuyAlbumButton.tsx | 6 |
| app/(site)/exegesis/[displayId]/TipTapEditor.tsx | 6 |
| lib/unsubscribe.ts | 5 |
| app/home/modules/PortalArtistPostItem.tsx | 5 |
| app/admin/playback/dashboard/PlaybackDashboardPrimitives.tsx | 5 |
| app/admin/exegesis/ExegesisModerator.tsx | 5 |
| app/home/gating/GateSpotlightOverlay.tsx | 5 |
| app/home/player/StageInline.tsx | 5 |
| app/home/modules/GiftAlbumButton.tsx | 5 |
| lib/shareTokens.ts | 5 |
| app/home/StableSessionShell.tsx | 4 |
| app/admin/playback/dashboard/QualifiedPlayTrendChart.tsx | 4 |
| app/(site)/exegesis/[displayId]/ExegesisTrackClient.tsx | 4 |
| app/api/admin/campaigns/drain/route.ts | 4 |
| app/home/modules/PortalArtistPostsComposer.tsx | 4 |
| app/admin/playback/dashboard/AudienceSplitCard.tsx | 4 |
| app/admin/playback/dashboard/playbackTelemetryDashboardModel.ts | 4 |
| app/(site)/exegesis/[displayId]/components/ExegesisRichComposer.tsx | 4 |
| app/admin/share-tokens/AdminMintShareTokenForm.tsx | 4 |
| app/api/admin/campaigns/images/upload/route.ts | 4 |
| app/api/exegesis/comment/route.ts | 3 |
| app/home/player/share.ts | 3 |
| lib/albums.ts | 3 |
| sanity/schemaTypes/modulePanels.ts | 3 |
| app/home/modules/portalArtistPostsPortableText.tsx | 3 |
| app/home/modules/PortalMemberPanel.tsx | 3 |
| lib/vocab.ts | 3 |

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
