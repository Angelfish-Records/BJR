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
  if (knownCount > 0) return `${knownCount} known recordingIds`;
  return "No catalogue entries";
}

type VisibleCue = { cue: LyricsApiCue; groupKey: string };

type CueRowProps = Readonly<{
  row: VisibleCue;
  index: number;
  selected: boolean;
  activeGroupKey: string;
  onCueClick: (index: number, lineKey: string, event: React.MouseEvent) => void;
  onFocusGroup: (groupKey: string) => void;
}>;

function CueRow(props: CueRowProps) {
  const { row, index, selected, activeGroupKey, onCueClick, onFocusGroup } =
    props;
  const { cue, groupKey } = row;
  const isActiveGroup = activeGroupKey.length > 0 && groupKey === activeGroupKey;
  const isMappedCanonical = !startsWithLk(groupKey);

  return (
    <div
      className={clsx([
        "relative w-full rounded-md bg-black/20 hover:bg-black/25",
        selected && "ring-1 ring-white/20",
        isActiveGroup && "ring-1 ring-white/25",
      ])}
    >
      <button
        type="button"
        className="absolute inset-0 z-0 rounded-md border-0 bg-transparent p-0"
        onClick={(event) => onCueClick(index, cue.lineKey, event)}
        title="Click to select/deselect. Shift-click for range."
        aria-label={`Select lyric line ${cue.lineKey}`}
      />
      <div className="pointer-events-none relative z-10 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs opacity-60">
              <span className="opacity-70">{fmtTimeMs(cue.tMs)}</span>
              <span className="opacity-50">·</span>
              <span className="truncate">{cue.lineKey}</span>
            </div>

            <div className="mt-1 text-sm opacity-90 line-clamp-2">
              {cue.text}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={clsx([
                  "pointer-events-auto relative rounded-full px-2 py-0.5 text-xs",
                  isMappedCanonical
                    ? "bg-white/10 hover:bg-white/15"
                    : "bg-white/5 hover:bg-white/10",
                ])}
                onClick={() => onFocusGroup(groupKey)}
                title="Focus this group"
              >
                <span className="opacity-80">group:</span>{" "}
                <span className="opacity-95">{groupKey}</span>
              </button>

              <span className="text-xs opacity-60">
                {isMappedCanonical ? "canonical" : "fallback"}
              </span>
            </div>
          </div>

          <div className="shrink-0 text-xs opacity-60">
            {selected ? "Selected" : ""}
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
        No lines match the current filters.
      </div>
    );
  }

  return props.visibleCues.map((row, index) => (
    <CueRow
      key={row.cue.lineKey}
      row={row}
      index={index}
      selected={props.selectedLineKeys[row.cue.lineKey] === true}
      activeGroupKey={props.activeGroupKey}
      onCueClick={props.onCueClick}
      onFocusGroup={props.onFocusGroup}
    />
  ));
}

type GroupListProps = Readonly<{
  lyrics: LyricsApiOk | null;
  groups: DerivedGroup[];
  activeGroupKey: string;
  onFocusGroup: (groupKey: string) => void;
}>;

function GroupList(props: GroupListProps) {
  if (!props.lyrics) {
    return <div className="text-sm opacity-60">Load a track to view groups.</div>;
  }
  if (props.groups.length === 0) {
    return <div className="text-sm opacity-60">No groups match your search.</div>;
  }

  return props.groups.map((group) => {
    const isActive = group.key === props.activeGroupKey;
    const badge = group.isCanonical ? "canonical" : "implicit";
    return (
      <button
        key={group.key}
        type="button"
        className={clsx([
          "w-full rounded-md bg-black/20 p-3 text-left hover:bg-black/25",
          isActive && "ring-1 ring-white/20",
        ])}
        onClick={() => props.onFocusGroup(group.key)}
        title="Focus group"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm opacity-90">{group.key}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs opacity-60">
              <span>{group.count} lines</span>
              <span className="opacity-40">·</span>
              <span>{badge}</span>
              {group.updatedAt ? (
                <>
                  <span className="opacity-40">·</span>
                  <span className="truncate">{group.updatedAt}</span>
                </>
              ) : null}
            </div>
          </div>
          <div className="shrink-0 text-xs opacity-60">
            {isActive ? "Focused" : ""}
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
  const [showOnlyUnmapped, setShowOnlyUnmapped] =
    React.useState<boolean>(false);
  const [showOnlySelected, setShowOnlySelected] =
    React.useState<boolean>(false);

  const [lastClickedIdx, setLastClickedIdx] = React.useState<number | null>(
    null,
  );

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
    return lyrics?.cues ?? [];
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
    const canonCount = (groupMap?.groups ?? []).length;
    return { total, mappedCount, unmapped, canonCount };
  }, [cues, lineToGroupKey, groupMap?.groups]);

  const derivedGroups: DerivedGroup[] = React.useMemo(() => {
    const members: Record<string, string[]> = {};
    for (const c of cues) {
      const gk = getLineGroupKey(c.lineKey);
      if (!members[gk]) members[gk] = [];
      members[gk].push(c.lineKey);
    }

    const out: DerivedGroup[] = [];
    const keys = Object.keys(members);

    for (const key of keys) {
      const meta = canonicalMetaByKey[key];
      const isCanonical = Boolean(meta) || isProbablyCanonicalGroupKey(key);
      out.push({
        key,
        isCanonical: Boolean(meta) || (isCanonical && !startsWithLk(key)),
        count: members[key]?.length ?? 0,
        updatedAt: meta?.updatedAt ?? null,
        lineKeys: members[key] ?? [],
      });
    }

    // Sort: canonical first, then by count desc, then by updatedAt desc, then key
    out.sort((a, b) => {
      if (a.isCanonical !== b.isCanonical) return a.isCanonical ? -1 : 1;
      if (a.count !== b.count) return b.count - a.count;
      const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      if (ta !== tb) return tb - ta;
      return a.key.localeCompare(b.key);
    });

    // Filter search
    const q = normalize(groupSearch);
    if (!q) return out;
    return out.filter((g) => normalize(g.key).includes(q));
  }, [cues, canonicalMetaByKey, groupSearch, getLineGroupKey]);

  const activeGroup: DerivedGroup | null = React.useMemo(() => {
    const gk = activeGroupKey.trim();
    if (!gk) return null;
    return derivedGroups.find((g) => g.key === gk) ?? null;
  }, [activeGroupKey, derivedGroups]);

  const cueByLineKey: Record<string, LyricsApiCue> = React.useMemo(() => {
    const out: Record<string, LyricsApiCue> = {};
    for (const c of cues) out[c.lineKey] = c;
    return out;
  }, [cues]);

  const visibleCues: Array<{ cue: LyricsApiCue; groupKey: string }> =
    React.useMemo(() => {
      const onlyUnmapped = showOnlyUnmapped;
      const onlySelected = showOnlySelected;

      const out: Array<{ cue: LyricsApiCue; groupKey: string }> = [];
      for (const c of cues) {
        const gk = getLineGroupKey(c.lineKey);
        const isUnmapped = !lineToGroupKey[c.lineKey];
        const isSel = Boolean(selectedLineKeys[c.lineKey]);

        if (onlyUnmapped && !isUnmapped) continue;
        if (onlySelected && !isSel) continue;

        out.push({ cue: c, groupKey: gk });
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
      for (const lk of lineKeys) next[lk] = value;
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
    setLastClickedIdx(null);
  }

  function onCueClick(idx: number, lineKey: string, e: React.MouseEvent) {
    // Shift range select within the *current visible list*
    if (e.shiftKey && lastClickedIdx !== null) {
      const lo = Math.min(lastClickedIdx, idx);
      const hi = Math.max(lastClickedIdx, idx);
      const slice = visibleCues.slice(lo, hi + 1).map((x) => x.cue.lineKey);

      const allSelected = slice.every((lk) => Boolean(selectedLineKeys[lk]));
      setSelectionForLineKeys(slice, !allSelected);
      setLastClickedIdx(idx);
      return;
    }

    toggleSelect(lineKey);
    setLastClickedIdx(idx);
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
    const recordingId = recordingIdInput.trim();
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
      const gk = await createNewGroupKey();
      await assignLineKeysToGroup(recordingId, gk, selectedKeys);
      await loadGrouping(recordingId);
      setActiveGroupKey(gk);
      // Keep selection so you can immediately confirm what moved
      setSelectedLineKeys((prev) => ({ ...prev }));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Create group failed.");
    } finally {
      setBusy(false);
    }
  }

  async function assignSelectionToActiveGroup() {
    const recordingId = recordingIdInput.trim();
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
      await assignLineKeysToGroup(recordingId, gk, selectedKeys);
      await loadGrouping(recordingId);
      setActiveGroupKey(gk);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Assign failed.");
    } finally {
      setBusy(false);
    }
  }

  async function clearSelectedMapping() {
    const recordingId = recordingIdInput.trim();
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
      await clearLineKeyMappings(recordingId, selectedKeys);
      await loadGrouping(recordingId);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Clear failed.");
    } finally {
      setBusy(false);
    }
  }

  async function clearActiveGroupMappings() {
    const recordingId = recordingIdInput.trim();
    if (!recordingId) return;

    if (!lyrics || !groupMap) {
      setErr("Load a track first.");
      return;
    }
    if (!activeGroup || startsWithLk(activeGroup.key)) {
      setErr("Choose a canonical group first.");
      return;
    }

    setErr("");
    setBusy(true);
    try {
      await clearLineKeyMappings(recordingId, activeGroup.lineKeys);
      await loadGrouping(recordingId);
      setActiveGroupKey("");
      clearSelection();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Clear group failed.");
    } finally {
      setBusy(false);
    }
  }

  async function splitSelectionIntoNewGroup() {
    const recordingId = recordingIdInput.trim();
    if (!recordingId) return;

    if (!lyrics || !groupMap) {
      setErr("Load a track first.");
      return;
    }
    if (!activeGroup || startsWithLk(activeGroup.key)) {
      setErr("Choose a canonical group first.");
      return;
    }
    if (selectedKeys.length === 0) {
      setErr("Select at least one line to split.");
      return;
    }

    const activeMembers = new Set<string>(activeGroup.lineKeys);
    const toSplit = selectedKeys.filter((lk) => activeMembers.has(lk));
    if (toSplit.length === 0) {
      setErr("Your selection has no lines from the active group.");
      return;
    }

    setErr("");
    setBusy(true);
    try {
      const newKey = await createNewGroupKey();
      await assignLineKeysToGroup(recordingId, newKey, toSplit);
      await loadGrouping(recordingId);
      setActiveGroupKey(newKey);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Split failed.");
    } finally {
      setBusy(false);
    }
  }

  function selectActiveGroupLines() {
    if (!activeGroup) return;
    setSelectionForLineKeys(activeGroup.lineKeys, true);
  }

  function deselectActiveGroupLines() {
    if (!activeGroup) return;
    setSelectionForLineKeys(activeGroup.lineKeys, false);
  }

  const canAct = Boolean(lyrics && groupMap && loadedRecordingId);
  const hasSelection = selectedKeys.length > 0;
  const knownRecordingIdsStatus = catalogueStatusText(
    knownIdsBusy,
    knownIdsErr,
    knownRecordingIds.length,
  );

  function focusGroup(groupKey: string): void {
    setActiveGroupKey(groupKey);
  }

  return (
    <div className="rounded-xl bg-white/5 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm opacity-70">Line grouping (Phase B1)</div>
          <div className="mt-1 text-xs opacity-60">
            Map multiple lineKeys → one canonical groupKey, then UI/comments
            resolve to the group.
          </div>
          <div className="mt-2 text-xs opacity-60">
            {stats.total} cues · {stats.mappedCount} mapped · {stats.unmapped}{" "}
            unmapped · {stats.canonCount} canonical groups
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex flex-col items-end">
            <input
              list="exegesis-recordingId-catalogue"
              className="w-[360px] max-w-[56vw] rounded-md bg-black/20 px-3 py-2 text-sm outline-none"
              placeholder="recordingId"
              value={recordingIdInput}
              onChange={(e) => setRecordingIdInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void loadGrouping();
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

      {lyrics ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs opacity-60">
          <div>
            loaded: <span className="opacity-90">{lyrics.recordingId}</span>
          </div>
          <div>·</div>
          <div>lyrics v{lyrics.version}</div>
          {lyrics.geniusUrl ? (
            <>
              <div>·</div>
              <a
                className="underline underline-offset-2 opacity-80 hover:opacity-95"
                href={lyrics.geniusUrl}
                target="_blank"
                rel="noreferrer"
              >
                genius
              </a>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        {/* LEFT: cues */}
        <div className="rounded-xl bg-black/15 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="text-sm opacity-80">Lines</div>
              <div className="text-xs opacity-60">
                {visibleCues.length} shown · {selectedKeys.length} selected
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex cursor-pointer items-center gap-2 text-xs opacity-75">
                <input
                  type="checkbox"
                  checked={showOnlyUnmapped}
                  onChange={(e) => setShowOnlyUnmapped(e.target.checked)}
                />
                <span>Unmapped only</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs opacity-75">
                <input
                  type="checkbox"
                  checked={showOnlySelected}
                  onChange={(e) => setShowOnlySelected(e.target.checked)}
                />
                <span>Selected only</span>
              </label>

              <button
                type="button"
                className="rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
                disabled={!hasSelection}
                onClick={() => clearSelection()}
                title="Clear selection"
              >
                Deselect all
              </button>
            </div>
          </div>

          <div
            className="mt-3 space-y-2"
            style={{ maxHeight: 560, overflowY: "auto" }}
          >
            <CueList
              lyrics={lyrics}
              visibleCues={visibleCues}
              selectedLineKeys={selectedLineKeys}
              activeGroupKey={activeGroupKey}
              onCueClick={onCueClick}
              onFocusGroup={focusGroup}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-md bg-white/10 px-3 py-2 text-sm hover:bg-white/15 disabled:opacity-40"
              disabled={busy || !canAct || !hasSelection}
              onClick={() => void createGroupFromSelection()}
              title="Creates a new canonical group and assigns the current selection to it"
            >
              Create group from selection
            </button>

            <button
              type="button"
              className="rounded-md bg-white/10 px-3 py-2 text-sm hover:bg-white/15 disabled:opacity-40"
              disabled={
                busy ||
                !canAct ||
                !hasSelection ||
                !activeGroupKey.trim() ||
                startsWithLk(activeGroupKey.trim())
              }
              onClick={() => void assignSelectionToActiveGroup()}
              title="Assign selection to the focused canonical group"
            >
              Add selection to focused group
            </button>

            <button
              type="button"
              className="rounded-md bg-white/5 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-40"
              disabled={busy || !canAct || !hasSelection}
              onClick={() => void clearSelectedMapping()}
              title="Remove mapping and fall back to v1 lk:<lineKey>"
            >
              Clear mapping for selection
            </button>
          </div>

          <div className="mt-2 text-xs opacity-60">
            Tip: click a “group:” pill to focus it. Shift-click for range
            selection.
          </div>
        </div>

        {/* RIGHT: groups + inspector */}
        <div className="rounded-xl bg-black/15 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm opacity-80">Groups</div>
            <div className="text-xs opacity-60">
              {derivedGroups.length} found
            </div>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <input
              className="w-full rounded-md bg-black/20 px-3 py-2 text-sm outline-none"
              placeholder="Search groups…"
              value={groupSearch}
              onChange={(e) => setGroupSearch(e.target.value)}
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
            style={{ maxHeight: 260, overflowY: "auto" }}
          >
            <GroupList
              lyrics={lyrics}
              groups={derivedGroups}
              activeGroupKey={activeGroupKey}
              onFocusGroup={focusGroup}
            />
          </div>

          <div className="mt-4 border-t border-white/10 pt-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm opacity-80">Group inspector</div>
              <button
                type="button"
                className="rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
                disabled={!activeGroupKey.trim()}
                onClick={() => setActiveGroupKey("")}
              >
                Clear focus
              </button>
            </div>

            {!activeGroup ? (
              <div className="mt-2 text-sm opacity-60">
                Focus a group (from the list, or by clicking a line’s “group:”
                pill).
              </div>
            ) : (
              <>
                <div className="mt-2 rounded-md bg-black/20 p-3">
                  <div className="text-sm font-semibold opacity-90">
                    {activeGroup.key}
                  </div>
                  <div className="mt-1 text-xs opacity-60">
                    {activeGroup.count} lines ·{" "}
                    {activeGroup.isCanonical ? "canonical" : "implicit"}
                    {activeGroup.updatedAt
                      ? `· updated ${activeGroup.updatedAt}`
                      : ""}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="rounded-md bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15 disabled:opacity-40"
                      disabled={
                        busy ||
                        !canAct ||
                        !hasSelection ||
                        startsWithLk(activeGroup.key)
                      }
                      onClick={() => void assignSelectionToActiveGroup()}
                      title="Assign selection to this canonical group"
                    >
                      Add selection here
                    </button>

                    <button
                      type="button"
                      className="rounded-md bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15 disabled:opacity-40"
                      disabled={
                        busy ||
                        !canAct ||
                        !hasSelection ||
                        startsWithLk(activeGroup.key)
                      }
                      onClick={() => void splitSelectionIntoNewGroup()}
                      title="Create a new canonical group and move the selected subset of this group into it"
                    >
                      Split selection → new group
                    </button>

                    <button
                      type="button"
                      className="rounded-md bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10 disabled:opacity-40"
                      disabled={
                        busy || !canAct || startsWithLk(activeGroup.key)
                      }
                      onClick={() => void clearActiveGroupMappings()}
                      title="Clear mapping for all lines currently in this canonical group"
                    >
                      Clear entire group
                    </button>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
                      disabled={!activeGroup.lineKeys.length}
                      onClick={() => selectActiveGroupLines()}
                    >
                      Select all in group
                    </button>
                    <button
                      type="button"
                      className="rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
                      disabled={!activeGroup.lineKeys.length}
                      onClick={() => deselectActiveGroupLines()}
                    >
                      Deselect all in group
                    </button>
                  </div>
                </div>

                <div
                  className="mt-3 space-y-2"
                  style={{ maxHeight: 280, overflowY: "auto" }}
                >
                  {activeGroup.lineKeys.map((lk) => {
                    const c = cueByLineKey[lk];
                    const isSel = Boolean(selectedLineKeys[lk]);
                    return (
                      <button
                        type="button"
                        key={lk}
                        className={clsx([
                          "w-full rounded-md bg-black/20 p-3 text-left hover:bg-black/25",
                          isSel && "ring-1 ring-white/20",
                        ])}
                        onClick={() => toggleSelect(lk)}
                        title="Click to select/deselect"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xs opacity-60">
                              {c ? fmtTimeMs(c.tMs) : ""}
                              <span className="opacity-50"> · </span>
                              {lk}
                            </div>
                            <div className="mt-1 text-sm opacity-90 line-clamp-2">
                              {c ? c.text : "(Missing cue text)"}
                            </div>
                          </div>
                          <div className="shrink-0 text-xs opacity-60">
                            {isSel ? "Selected" : ""}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 text-xs opacity-60">
                  Note: grouping changes how lineKey resolves to a canonical
                  thread; it doesn’t move existing comments yet.
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}