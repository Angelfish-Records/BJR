// web/app/admin/exegesis/ExegesisGroupTool.tsx
"use client";

import React from "react";

type LyricsApiCue = {
  lineKey: string;
  tMs: number;
  text: string;
  endMs?: number;
};

type LyricsApiOk = {
  ok: true;
  recordingId: string;
  offsetMs: number;
  version: string;
  geniusUrl: string | null;
  cues: LyricsApiCue[];
};

type GroupMapOk = {
  ok: true;
  recordingId: string;
  map: Record<string, { canonicalGroupKey: string; updatedAt: string }>;
  groups: Array<{
    canonicalGroupKey: string;
    count: number;
    updatedAt: string;
  }>;
};

type ApiErrShape = { ok: false; error: string };

type CanonGroupMeta = {
  canonicalGroupKey: string;
  count: number;
  updatedAt: string;
};

type DerivedGroup = {
  key: string; // canonicalGroupKey OR implicit lk:<lineKey>
  isCanonical: boolean;
  count: number;
  updatedAt: string | null;
  lineKeys: string[];
  firstCueIndex: number;
  previewLines: string[];
  searchText: string;
};

type NewGroupOk = { ok: true; canonicalGroupKey: string };
type SetOk = { ok: true; updated: number };
type ClearOk = { ok: true; deleted: number };

function isApiErrShape(v: unknown): v is ApiErrShape {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return r.ok === false && typeof r.error === "string";
}

function assertOk<T extends { ok: true }>(
  j: unknown,
  fallbackMsg: string,
): asserts j is T {
  if (typeof j !== "object" || j === null) throw new Error(fallbackMsg);
  const r = j as Record<string, unknown>;
  if (r.ok !== true) {
    if (isApiErrShape(j)) throw new Error(j.error || fallbackMsg);
    throw new Error(fallbackMsg);
  }
}

function isNewGroupOk(v: unknown): v is NewGroupOk {
  if (typeof v !== "object" || v === null) return false;
  const rr = v as Record<string, unknown>;
  return rr.ok === true && typeof rr.canonicalGroupKey === "string";
}

function isSetOk(v: unknown): v is SetOk {
  if (typeof v !== "object" || v === null) return false;
  const rr = v as Record<string, unknown>;
  return rr.ok === true && typeof rr.updated === "number";
}

function isClearOk(v: unknown): v is ClearOk {
  if (typeof v !== "object" || v === null) return false;
  const rr = v as Record<string, unknown>;
  return rr.ok === true && typeof rr.deleted === "number";
}

function clsx(parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function safeParseSearchParam(name: string): string {
  if (typeof window === "undefined") return "";
  const sp = new URLSearchParams(window.location.search);
  return (sp.get(name) ?? "").trim();
}

function fmtTimeMs(ms: number): string {
  if (!Number.isFinite(ms)) return String(ms);
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function normalize(s: string): string {
  return (s ?? "").toLowerCase().trim();
}

const PARA_BREAK = "__PARA_BREAK__";

function isGroupableCue(cue: LyricsApiCue): boolean {
  return cue.text.trim() !== PARA_BREAK;
}

function startsWithLk(groupKey: string): boolean {
  return normalize(groupKey).startsWith("lk:");
}

function isProbablyCanonicalGroupKey(groupKey: string): boolean {
  const g = normalize(groupKey);
  if (!g) return false;
  if (startsWithLk(g)) return false;
  // Your new keys look like g:..., but don’t hard-require it.
  // Prefer server-reported canonical groups as truth, and use this only for display.
  return g.startsWith("g:") || g.startsWith("cg:") || g.startsWith("grp:");
}

function recordingIdFromCatalogueItem(
  item: unknown,
  allowString: boolean,
): string | null {
  if (allowString && typeof item === "string") return item.trim();
  if (typeof item !== "object" || item === null) return null;

  const recordingId = (item as Record<string, unknown>).recordingId;
  return typeof recordingId === "string" ? recordingId.trim() : null;
}

function appendCatalogueRecordingIds(
  target: string[],
  items: unknown,
  allowStrings: boolean,
): void {
  if (!Array.isArray(items)) return;
  for (const item of items) {
    const recordingId = recordingIdFromCatalogueItem(item, allowStrings);
    if (recordingId !== null) target.push(recordingId);
  }
}

function parseKnownRecordingIds(payload: unknown): string[] {
  const out: string[] = [];
  appendCatalogueRecordingIds(out, payload, true);

  if (typeof payload === "object" && payload !== null) {
    const record = payload as Record<string, unknown>;
    appendCatalogueRecordingIds(out, record.recordings, true);
    appendCatalogueRecordingIds(out, record.items, false);
  }

  return Array.from(new Set(out)).sort((a, b) => a.localeCompare(b));
}

async function fetchKnownRecordingIds(): Promise<string[]> {
  const response = await fetch("/api/lyrics/catalogue", { cache: "no-store" });
  const payload: unknown = await response.json();

  // Temporary debug so we see the real shape once
  console.debug("lyrics catalogue payload", payload);

  return parseKnownRecordingIds(payload);
}

async function createNewGroupKey(): Promise<string> {
  const response = await fetch("/api/admin/exegesis/group-map/new-group", {
    method: "POST",
  });
  const payload: unknown = await response.json();
  if (!isNewGroupOk(payload)) {
    if (isApiErrShape(payload)) {
      throw new Error(payload.error || "Failed to create group.");
    }
    throw new Error("Failed to create group.");
  }
  return payload.canonicalGroupKey;
}

async function assignLineKeysToGroup(
  recordingId: string,
  canonicalGroupKey: string,
  lineKeys: string[],
): Promise<number> {
  const response = await fetch("/api/admin/exegesis/group-map/set", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ recordingId, canonicalGroupKey, lineKeys }),
  });
  const payload: unknown = await response.json();
  if (!isSetOk(payload)) {
    if (isApiErrShape(payload)) {
      throw new Error(payload.error || "Assign failed.");
    }
    throw new Error("Assign failed.");
  }
  return payload.updated;
}

async function clearLineKeyMappings(
  recordingId: string,
  lineKeys: string[],
): Promise<number> {
  const response = await fetch("/api/admin/exegesis/group-map/clear", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ recordingId, lineKeys }),
  });
  const payload: unknown = await response.json();
  if (!isClearOk(payload)) {
    if (isApiErrShape(payload)) {
      throw new Error(payload.error || "Clear failed.");
    }
    throw new Error("Clear failed.");
  }
  return payload.deleted;
}

function catalogueStatusText(
  busy: boolean,
  error: string,
  knownCount: number,
): string {
  if (busy) return "Loading catalogue…";
  if (error) return `Catalogue unavailable: ${error}`;
  if (knownCount > 0) return `${knownCount} tracks available`;
  return "No catalogue entries";
}

type VisibleCue = { cue: LyricsApiCue; groupKey: string };

type CueRowProps = Readonly<{
  row: VisibleCue;
  index: number;
  selected: boolean;
  activeGroupKey: string;
  groupLabel: string | null;
  showTechnicalDetails: boolean;
  onCueClick: (index: number, lineKey: string, event: React.MouseEvent) => void;
  onFocusGroup: (groupKey: string) => void;
}>;

function CueRow(props: CueRowProps) {
  const {
    row,
    index,
    selected,
    activeGroupKey,
    groupLabel,
    showTechnicalDetails,
    onCueClick,
    onFocusGroup,
  } = props;
  const { cue, groupKey } = row;
  const isActiveGroup = activeGroupKey.length > 0 && groupKey === activeGroupKey;

  return (
    <div
      id={`exegesis-line-${cue.lineKey}`}
      className={clsx([
        "relative w-full rounded-lg border border-white/5 bg-black/20 transition hover:bg-black/25",
        selected && "bg-white/10 ring-1 ring-white/30",
        isActiveGroup && "bg-white/5 ring-1 ring-white/20",
      ])}
      style={
        isActiveGroup
          ? { boxShadow: "inset 3px 0 0 rgba(255,255,255,0.42)" }
          : undefined
      }
    >
      <button
        type="button"
        className="absolute inset-0 z-0 rounded-lg border-0 bg-transparent p-0"
        onClick={(event) => onCueClick(index, cue.lineKey, event)}
        title="Click to select. Shift-click for a range; Command/Ctrl-click to add or remove."
        aria-label={`Select lyric line: ${cue.text}`}
      />

      <div className="pointer-events-none relative z-10 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm leading-6 opacity-95">{cue.text}</div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {groupLabel ? (
                <button
                  type="button"
                  className="pointer-events-auto relative rounded-full bg-white/10 px-2 py-0.5 text-xs hover:bg-white/15"
                  onClick={() => onFocusGroup(groupKey)}
                  title={`Highlight ${groupLabel}`}
                >
                  {groupLabel}
                </button>
              ) : (
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs opacity-60">
                  Ungrouped
                </span>
              )}

              {selected ? (
                <span className="text-xs font-medium opacity-80">Selected</span>
              ) : null}
            </div>

            {showTechnicalDetails ? (
              <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[11px] opacity-45">
                <span>{fmtTimeMs(cue.tMs)}</span>
                <span>{cue.lineKey}</span>
                <span>{groupKey}</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

type CueListProps = Readonly<{
  lyrics: LyricsApiOk | null;
  visibleCues: VisibleCue[];
  selectedLineKeys: Record<string, boolean>;
  activeGroupKey: string;
  groupOrdinalByKey: Record<string, number>;
  showTechnicalDetails: boolean;
  onCueClick: (index: number, lineKey: string, event: React.MouseEvent) => void;
  onFocusGroup: (groupKey: string) => void;
}>;

function CueList(props: CueListProps) {
  if (!props.lyrics) {
    return <div className="text-sm opacity-60">Load a track to begin grouping.</div>;
  }
  if (props.visibleCues.length === 0) {
    return (
      <div className="text-sm opacity-60">
        No lyric lines match the current filters.
      </div>
    );
  }

  return props.visibleCues.map((row, index) => {
    const ordinal = props.groupOrdinalByKey[row.groupKey];
    return (
      <CueRow
        key={row.cue.lineKey}
        row={row}
        index={index}
        selected={props.selectedLineKeys[row.cue.lineKey] === true}
        activeGroupKey={props.activeGroupKey}
        groupLabel={ordinal ? `Group ${ordinal}` : null}
        showTechnicalDetails={props.showTechnicalDetails}
        onCueClick={props.onCueClick}
        onFocusGroup={props.onFocusGroup}
      />
    );
  });
}

type GroupListProps = Readonly<{
  lyrics: LyricsApiOk | null;
  groups: DerivedGroup[];
  activeGroupKey: string;
  groupOrdinalByKey: Record<string, number>;
  showTechnicalDetails: boolean;
  onFocusGroup: (groupKey: string) => void;
}>;

function GroupList(props: GroupListProps) {
  if (!props.lyrics) {
    return <div className="text-sm opacity-60">Load a track to view groups.</div>;
  }
  if (props.groups.length === 0) {
    return (
      <div className="text-sm opacity-60">
        No groups yet. Select lyric lines and choose Group selected.
      </div>
    );
  }

  return props.groups.map((group) => {
    const isActive = group.key === props.activeGroupKey;
    const ordinal = props.groupOrdinalByKey[group.key];
    const label = ordinal ? `Group ${ordinal}` : "Group";

    return (
      <button
        key={group.key}
        type="button"
        className={clsx([
          "w-full rounded-lg border border-white/5 bg-black/20 p-3 text-left transition hover:bg-black/25",
          isActive && "bg-white/5 ring-1 ring-white/25",
        ])}
        onClick={() => props.onFocusGroup(group.key)}
        title={`Highlight ${label}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold opacity-95">{label}</div>

            <div className="mt-2 space-y-1">
              {group.previewLines.map((line, index) => (
                <div
                  key={`${group.key}:preview:${index}`}
                  className="truncate text-sm opacity-75"
                >
                  {line}
                </div>
              ))}
            </div>

            <div className="mt-2 text-xs opacity-55">
              {group.count} {group.count === 1 ? "line" : "lines"}
              {group.count > group.previewLines.length
                ? ` · +${group.count - group.previewLines.length} more`
                : ""}
            </div>

            {props.showTechnicalDetails ? (
              <div className="mt-2 break-all text-[11px] opacity-40">
                {group.key}
                {group.updatedAt ? ` · updated ${group.updatedAt}` : ""}
              </div>
            ) : null}
          </div>

          <div className="shrink-0 text-xs opacity-60">
            {isActive ? "Highlighted" : ""}
          </div>
        </div>
      </button>
    );
  });
}

export default function ExegesisGroupTool() {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");

  const [recordingIdInput, setRecordingIdInput] = React.useState<string>("");
  const [loadedRecordingId, setLoadedRecordingId] = React.useState<string>("");

  const [lyrics, setLyrics] = React.useState<LyricsApiOk | null>(null);
  const [groupMap, setGroupMap] = React.useState<GroupMapOk | null>(null);

  const [selectedLineKeys, setSelectedLineKeys] = React.useState<
    Record<string, boolean>
  >({});
  const [activeGroupKey, setActiveGroupKey] = React.useState<string>("");

  const [groupSearch, setGroupSearch] = React.useState<string>("");
  const [showTechnicalDetails, setShowTechnicalDetails] =
    React.useState<boolean>(false);
  const [showOnlyUnmapped, setShowOnlyUnmapped] =
    React.useState<boolean>(false);
  const [showOnlySelected, setShowOnlySelected] =
    React.useState<boolean>(false);

  const [lastClickedLineKey, setLastClickedLineKey] = React.useState<
    string | null
  >(null);

  const [knownRecordingIds, setKnownRecordingIds] = React.useState<string[]>(
    [],
  );
  const [knownIdsBusy, setKnownIdsBusy] = React.useState<boolean>(false);
  const [knownIdsErr, setKnownIdsErr] = React.useState<string>("");

  // Init recordingId from URL or localStorage + load catalogue for picker
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const q = safeParseSearchParam("recordingId");
    const ls = window.localStorage.getItem(
      "exegesisAdmin.groupTool.recordingId",
    );
    const seed = (q || ls || "").trim();
    if (seed) setRecordingIdInput(seed);
    // Auto-load only if query param explicitly provided.
    if (q) void loadGrouping(seed);

    // Load known recordingIds for picker (best-effort; don’t block tool usage)
    setKnownIdsErr("");
    setKnownIdsBusy(true);
    void fetchKnownRecordingIds()
      .then(setKnownRecordingIds)
      .catch((e: unknown) => {
        setKnownIdsErr(
          e instanceof Error ? e.message : "Failed to load catalogue.",
        );
      })
      .finally(() => setKnownIdsBusy(false));

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const v = recordingIdInput.trim();
    if (!v) return;
    window.localStorage.setItem("exegesisAdmin.groupTool.recordingId", v);
  }, [recordingIdInput]);

  const selectedKeys: string[] = React.useMemo(() => {
    return Object.keys(selectedLineKeys).filter((k) =>
      Boolean(selectedLineKeys[k]),
    );
  }, [selectedLineKeys]);

  const canonicalMetaByKey: Record<string, CanonGroupMeta> =
    React.useMemo(() => {
      const out: Record<string, CanonGroupMeta> = {};
      for (const g of groupMap?.groups ?? []) out[g.canonicalGroupKey] = g;
      return out;
    }, [groupMap?.groups]);

  const cues: LyricsApiCue[] = React.useMemo(() => {
    return (lyrics?.cues ?? []).filter(isGroupableCue);
  }, [lyrics]);

  const lineToGroupKey: Record<string, string> = React.useMemo(() => {
    const out: Record<string, string> = {};
    const m = groupMap?.map ?? {};
    for (const lk of Object.keys(m)) {
      const gk = m[lk]?.canonicalGroupKey;
      if (typeof gk === "string" && gk.trim()) out[lk] = gk;
    }
    return out;
  }, [groupMap?.map]);

  const getLineGroupKey = React.useCallback(
    (lineKey: string): string => {
      const mapped = lineToGroupKey[lineKey];
      if (mapped) return mapped;
      return `lk:${lineKey}`;
    },
    [lineToGroupKey],
  );

  const stats = React.useMemo(() => {
    let mappedCount = 0;
    for (const c of cues) {
      if (lineToGroupKey[c.lineKey]) mappedCount += 1;
    }
    const total = cues.length;
    const unmapped = Math.max(0, total - mappedCount);
    return { total, mappedCount, unmapped };
  }, [cues, lineToGroupKey]);

  const allDerivedGroups: DerivedGroup[] = React.useMemo(() => {
    const members: Record<string, string[]> = {};
    const firstCueIndexByGroup: Record<string, number> = {};
    const textByLineKey: Record<string, string> = {};

    for (let index = 0; index < cues.length; index += 1) {
      const cue = cues[index];
      const groupKey = getLineGroupKey(cue.lineKey);
      if (!members[groupKey]) members[groupKey] = [];
      members[groupKey].push(cue.lineKey);
      textByLineKey[cue.lineKey] = cue.text;
      if (firstCueIndexByGroup[groupKey] === undefined) {
        firstCueIndexByGroup[groupKey] = index;
      }
    }

    const out: DerivedGroup[] = [];

    for (const key of Object.keys(members)) {
      const meta = canonicalMetaByKey[key];
      const isCanonical =
        Boolean(meta) || (isProbablyCanonicalGroupKey(key) && !startsWithLk(key));
      const lineKeys = members[key] ?? [];
      const allLines = lineKeys
        .map((lineKey) => textByLineKey[lineKey] ?? "")
        .filter(Boolean);

      out.push({
        key,
        isCanonical,
        count: lineKeys.length,
        updatedAt: meta?.updatedAt ?? null,
        lineKeys,
        firstCueIndex: firstCueIndexByGroup[key] ?? Number.MAX_SAFE_INTEGER,
        previewLines: allLines.slice(0, 3),
        searchText: allLines.join(" "),
      });
    }

    out.sort((a, b) => {
      if (a.isCanonical !== b.isCanonical) return a.isCanonical ? -1 : 1;
      if (a.firstCueIndex !== b.firstCueIndex) {
        return a.firstCueIndex - b.firstCueIndex;
      }
      return a.key.localeCompare(b.key);
    });

    return out;
  }, [cues, canonicalMetaByKey, getLineGroupKey]);

  const canonicalGroups = React.useMemo(
    () => allDerivedGroups.filter((group) => group.isCanonical),
    [allDerivedGroups],
  );

  const groupOrdinalByKey: Record<string, number> = React.useMemo(() => {
    const out: Record<string, number> = {};
    canonicalGroups.forEach((group, index) => {
      out[group.key] = index + 1;
    });
    return out;
  }, [canonicalGroups]);

  const derivedGroups: DerivedGroup[] = React.useMemo(() => {
    const query = normalize(groupSearch);
    if (!query) return canonicalGroups;
    return canonicalGroups.filter((group) =>
      normalize(group.searchText).includes(query),
    );
  }, [canonicalGroups, groupSearch]);

  const activeGroup: DerivedGroup | null = React.useMemo(() => {
    const groupKey = activeGroupKey.trim();
    if (!groupKey) return null;
    return allDerivedGroups.find((group) => group.key === groupKey) ?? null;
  }, [activeGroupKey, allDerivedGroups]);

  const visibleCues: VisibleCue[] = React.useMemo(() => {
    const out: VisibleCue[] = [];

    for (const cue of cues) {
      const groupKey = getLineGroupKey(cue.lineKey);
      const isUnmapped = !lineToGroupKey[cue.lineKey];
      const isSelected = Boolean(selectedLineKeys[cue.lineKey]);

      if (showOnlyUnmapped && !isUnmapped) continue;
      if (showOnlySelected && !isSelected) continue;

      out.push({ cue, groupKey });
    }

    return out;
  }, [
    cues,
    getLineGroupKey,
    lineToGroupKey,
    selectedLineKeys,
    showOnlySelected,
    showOnlyUnmapped,
  ]);

  function setSelectionForLineKeys(lineKeys: string[], value: boolean) {
    setSelectedLineKeys((prev) => {
      const next: Record<string, boolean> = { ...prev };
      for (const lineKey of lineKeys) next[lineKey] = value;
      return next;
    });
  }

  function toggleSelect(lineKey: string) {
    setSelectedLineKeys((prev) => ({
      ...prev,
      [lineKey]: !prev[lineKey],
    }));
  }

  function clearSelection() {
    setSelectedLineKeys({});
    setLastClickedLineKey(null);
  }

  function onCueClick(index: number, lineKey: string, event: React.MouseEvent) {
    const anchorIndex = lastClickedLineKey
      ? visibleCues.findIndex((row) => row.cue.lineKey === lastClickedLineKey)
      : -1;

    if (event.shiftKey && anchorIndex >= 0) {
      const lo = Math.min(anchorIndex, index);
      const hi = Math.max(anchorIndex, index);
      const rangeLineKeys = visibleCues
        .slice(lo, hi + 1)
        .map((row) => row.cue.lineKey);

      if (event.metaKey || event.ctrlKey) {
        setSelectionForLineKeys(rangeLineKeys, true);
      } else {
        const next: Record<string, boolean> = {};
        for (const key of rangeLineKeys) next[key] = true;
        setSelectedLineKeys(next);
      }

      setLastClickedLineKey(lineKey);
      return;
    }

    if (event.metaKey || event.ctrlKey) {
      toggleSelect(lineKey);
    } else {
      const isOnlySelected =
        selectedKeys.length === 1 && Boolean(selectedLineKeys[lineKey]);
      setSelectedLineKeys(isOnlySelected ? {} : { [lineKey]: true });
    }

    setLastClickedLineKey(lineKey);
  }

  async function loadGrouping(seed?: string) {
    const recordingId = (seed ?? recordingIdInput).trim();
    if (!recordingId) {
      setErr("Enter a recordingId for grouping.");
      return;
    }

    setErr("");
    setBusy(true);
    try {
      const lr = await fetch(
        `/api/lyrics/by-track?recordingId=${encodeURIComponent(recordingId)}`,
        { cache: "no-store" },
      );
      const lj: unknown = await lr.json();
      assertOk<LyricsApiOk>(lj, "Failed to load lyrics.");
      setLyrics(lj);

      const mr = await fetch(
        `/api/admin/exegesis/group-map?recordingId=${encodeURIComponent(recordingId)}`,
        { cache: "no-store" },
      );
      const mj: unknown = await mr.json();
      assertOk<GroupMapOk>(mj, "Failed to load group map.");
      setGroupMap(mj);

      setLoadedRecordingId(recordingId);
      setActiveGroupKey("");
      clearSelection();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load grouping.");
      setLyrics(null);
      setGroupMap(null);
      setLoadedRecordingId("");
      setActiveGroupKey("");
      clearSelection();
    } finally {
      setBusy(false);
    }
  }

  async function createGroupFromSelection() {
    const recordingId = loadedRecordingId.trim();
    if (!recordingId) return;

    if (!lyrics || !groupMap) {
      setErr("Load a track first.");
      return;
    }
    if (selectedKeys.length === 0) {
      setErr("Select at least one line.");
      return;
    }

    setErr("");
    setBusy(true);
    try {
      const selection = [...selectedKeys];
      const gk = await createNewGroupKey();
      await assignLineKeysToGroup(recordingId, gk, selection);
      await loadGrouping(recordingId);
      setActiveGroupKey(gk);
      const nextSelection: Record<string, boolean> = {};
      for (const lineKey of selection) nextSelection[lineKey] = true;
      setSelectedLineKeys(nextSelection);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Create group failed.");
    } finally {
      setBusy(false);
    }
  }

  async function assignSelectionToActiveGroup() {
    const recordingId = loadedRecordingId.trim();
    if (!recordingId) return;

    const gk = activeGroupKey.trim();
    if (!gk || startsWithLk(gk)) {
      setErr("Choose a canonical group in the sidebar first.");
      return;
    }
    if (!lyrics || !groupMap) {
      setErr("Load a track first.");
      return;
    }
    if (selectedKeys.length === 0) {
      setErr("Select at least one line.");
      return;
    }

    setErr("");
    setBusy(true);
    try {
      const selection = [...selectedKeys];
      await assignLineKeysToGroup(recordingId, gk, selection);
      await loadGrouping(recordingId);
      setActiveGroupKey(gk);
      const nextSelection: Record<string, boolean> = {};
      for (const lineKey of selection) nextSelection[lineKey] = true;
      setSelectedLineKeys(nextSelection);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Assign failed.");
    } finally {
      setBusy(false);
    }
  }

  async function clearSelectedMapping() {
    const recordingId = loadedRecordingId.trim();
    if (!recordingId) return;

    if (!lyrics || !groupMap) {
      setErr("Load a track first.");
      return;
    }
    if (selectedKeys.length === 0) {
      setErr("Select at least one line.");
      return;
    }

    setErr("");
    setBusy(true);
    try {
      const selection = [...selectedKeys];
      await clearLineKeyMappings(recordingId, selection);
      await loadGrouping(recordingId);
      const nextSelection: Record<string, boolean> = {};
      for (const lineKey of selection) nextSelection[lineKey] = true;
      setSelectedLineKeys(nextSelection);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Clear failed.");
    } finally {
      setBusy(false);
    }
  }


  const canAct = Boolean(
    lyrics &&
      groupMap &&
      loadedRecordingId &&
      recordingIdInput.trim() === loadedRecordingId,
  );
  const hasSelection = selectedKeys.length > 0;
  const activeGroupOrdinal = activeGroup
    ? groupOrdinalByKey[activeGroup.key] ?? null
    : null;
  const activeGroupLabel = activeGroupOrdinal
    ? `Group ${activeGroupOrdinal}`
    : null;
  const knownRecordingIdsStatus = catalogueStatusText(
    knownIdsBusy,
    knownIdsErr,
    knownRecordingIds.length,
  );

  function focusGroup(groupKey: string): void {
    const group = allDerivedGroups.find((candidate) => candidate.key === groupKey);
    setActiveGroupKey(groupKey);
    setShowOnlyUnmapped(false);
    setShowOnlySelected(false);

    const firstLineKey = group?.lineKeys[0];
    if (!firstLineKey || typeof window === "undefined") return;

    window.setTimeout(() => {
      document
        .getElementById(`exegesis-line-${firstLineKey}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  }

  return (
    <div className="rounded-xl bg-white/5 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold opacity-90">Lyric groups</div>
          <div className="mt-1 max-w-2xl text-xs opacity-60">
            Select lyric lines on the left. Create a group, or choose a group on
            the right and add selected lines to it.
          </div>
          <div className="mt-2 text-xs opacity-60">
            {stats.total} lyric lines · {stats.mappedCount} grouped · {stats.unmapped}{" "}
            ungrouped · {canonicalGroups.length} groups
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex flex-col items-end">
            <input
              list="exegesis-recordingId-catalogue"
              className="w-[360px] max-w-[56vw] rounded-md bg-black/20 px-3 py-2 text-sm outline-none"
              placeholder="Choose a track"
              value={recordingIdInput}
              onChange={(event) => setRecordingIdInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void loadGrouping();
              }}
            />
            <datalist id="exegesis-recordingId-catalogue">
              {knownRecordingIds.map((id) => (
                <option key={id} value={id} />
              ))}
            </datalist>

            <div className="mt-1 text-[11px] opacity-60">
              {knownRecordingIdsStatus}
            </div>
          </div>

          <button
            type="button"
            className="rounded-md bg-white/10 px-3 py-2 text-sm hover:bg-white/15 disabled:opacity-40"
            disabled={busy || !recordingIdInput.trim()}
            onClick={() => void loadGrouping()}
          >
            {busy ? "Loading…" : "Load"}
          </button>
        </div>
      </div>

      {err ? (
        <div className="mt-3 rounded-md bg-white/5 p-3 text-sm">{err}</div>
      ) : null}

      {lyrics && showTechnicalDetails ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs opacity-50">
          <span>{lyrics.recordingId}</span>
          <span>·</span>
          <span>lyrics v{lyrics.version}</span>
          {lyrics.geniusUrl ? (
            <>
              <span>·</span>
              <a
                className="underline underline-offset-2 opacity-80 hover:opacity-95"
                href={lyrics.geniusUrl}
                target="_blank"
                rel="noreferrer"
              >
                Genius
              </a>
            </>
          ) : null}
        </div>
      ) : null}

      {lyrics ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-black/15 p-3">
          <div>
            <div className="text-sm font-medium opacity-90">
              {hasSelection
                ? `${selectedKeys.length} ${selectedKeys.length === 1 ? "line" : "lines"} selected`
                : "Select lyric lines to begin"}
            </div>
            <div className="mt-1 text-xs opacity-55">
              Click for one line · Command/Ctrl-click to add or remove · Shift-click for a range
              {activeGroupLabel ? ` · ${activeGroupLabel} highlighted` : ""}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-md bg-white/10 px-3 py-2 text-sm hover:bg-white/15 disabled:opacity-40"
              disabled={busy || !canAct || !hasSelection}
              onClick={() => void createGroupFromSelection()}
              title="Create a new group from the selected lyric lines"
            >
              Group selected
            </button>

            <button
              type="button"
              className="rounded-md bg-white/10 px-3 py-2 text-sm hover:bg-white/15 disabled:opacity-40"
              disabled={
                busy ||
                !canAct ||
                !hasSelection ||
                !activeGroup?.isCanonical
              }
              onClick={() => void assignSelectionToActiveGroup()}
              title="Add the selected lyric lines to the highlighted group"
            >
              {activeGroupLabel ? `Add to ${activeGroupLabel}` : "Add to group"}
            </button>

            <button
              type="button"
              className="rounded-md bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
              disabled={busy || !canAct || !hasSelection}
              onClick={() => void clearSelectedMapping()}
              title="Remove selected lyric lines from their current groups"
            >
              Ungroup
            </button>

            <button
              type="button"
              className="rounded-md bg-white/5 px-2 py-2 text-xs hover:bg-white/10 disabled:opacity-40"
              disabled={!hasSelection}
              onClick={clearSelection}
            >
              Clear selection
            </button>

            <button
              type="button"
              className="rounded-md bg-white/5 px-2 py-2 text-xs hover:bg-white/10"
              onClick={() => setShowTechnicalDetails((value) => !value)}
            >
              {showTechnicalDetails ? "Hide details" : "Details"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="rounded-xl bg-black/15 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium opacity-85">Lyrics</div>
              <div className="text-xs opacity-55">
                {visibleCues.length} shown · {selectedKeys.length} selected
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex cursor-pointer items-center gap-2 text-xs opacity-75">
                <input
                  type="checkbox"
                  checked={showOnlyUnmapped}
                  onChange={(event) => setShowOnlyUnmapped(event.target.checked)}
                />
                <span>Ungrouped only</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs opacity-75">
                <input
                  type="checkbox"
                  checked={showOnlySelected}
                  onChange={(event) => setShowOnlySelected(event.target.checked)}
                />
                <span>Selected only</span>
              </label>
            </div>
          </div>

          <div
            className="mt-3 space-y-2"
            style={{ maxHeight: 620, overflowY: "auto" }}
          >
            <CueList
              lyrics={lyrics}
              visibleCues={visibleCues}
              selectedLineKeys={selectedLineKeys}
              activeGroupKey={activeGroupKey}
              groupOrdinalByKey={groupOrdinalByKey}
              showTechnicalDetails={showTechnicalDetails}
              onCueClick={onCueClick}
              onFocusGroup={focusGroup}
            />
          </div>
        </div>

        <div className="rounded-xl bg-black/15 p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium opacity-85">Groups</div>
              <div className="mt-1 text-xs opacity-55">
                Click a group to highlight its lyric lines.
              </div>
            </div>
            <div className="text-xs opacity-55">{canonicalGroups.length}</div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <input
              className="w-full rounded-md bg-black/20 px-3 py-2 text-sm outline-none"
              placeholder="Search group lyrics…"
              value={groupSearch}
              onChange={(event) => setGroupSearch(event.target.value)}
            />
            <button
              type="button"
              className="rounded-md bg-white/5 px-2 py-2 text-xs hover:bg-white/10 disabled:opacity-40"
              disabled={!groupSearch.trim()}
              onClick={() => setGroupSearch("")}
              title="Clear search"
            >
              Clear
            </button>
          </div>

          <div
            className="mt-3 space-y-2"
            style={{ maxHeight: 560, overflowY: "auto" }}
          >
            <GroupList
              lyrics={lyrics}
              groups={derivedGroups}
              activeGroupKey={activeGroupKey}
              groupOrdinalByKey={groupOrdinalByKey}
              showTechnicalDetails={showTechnicalDetails}
              onFocusGroup={focusGroup}
            />
          </div>

          {activeGroup?.isCanonical ? (
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
              <div className="min-w-0">
                <div className="text-xs opacity-55">Highlighted</div>
                <div className="mt-1 text-sm font-medium opacity-90">
                  {activeGroupLabel}
                </div>
                <div className="mt-1 text-xs opacity-55">
                  {activeGroup.count} {activeGroup.count === 1 ? "line" : "lines"}
                </div>
              </div>
              <button
                type="button"
                className="rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
                onClick={() => setActiveGroupKey("")}
              >
                Clear highlight
              </button>
            </div>
          ) : null}

          <div className="mt-3 text-xs leading-5 opacity-45">
            Lines with existing discussion are protected from regrouping until
            discussion migration is supported.
          </div>
        </div>
      </div>
    </div>
  );
}