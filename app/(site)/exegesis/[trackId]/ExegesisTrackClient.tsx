// web/app/(site)/exegesis/[trackId]/ExegesisTrackClient.tsx
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
  trackId: string;
  offsetMs: number;
  version: string;
  geniusUrl: string | null;
  cues: LyricsApiCue[];
};

type ThreadSort = "top" | "recent";

type IdentityDTO = {
  memberId: string;
  anonLabel: string;
  publicName: string | null;
  publicNameUnlockedAt: string | null;
  contributionCount: number;
};

type CommentDTO = {
  id: string;
  trackId: string;
  groupKey: string;
  lineKey: string;
  parentId: string | null;
  rootId: string;
  depth: number;
  bodyRich: unknown;
  bodyPlain: string;
  tMs: number | null;
  lineTextSnapshot: string;
  lyricsVersion: string | null;
  createdByMemberId: string;
  status: "live" | "hidden" | "deleted";
  createdAt: string;
  editedAt: string | null;
  editCount: number;
  voteCount: number;
  viewerHasVoted: boolean;
};

type ThreadMetaDTO = {
  trackId: string;
  groupKey: string;
  pinnedCommentId: string | null;
  locked: boolean;
  commentCount: number;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
};

type ThreadApiOk = {
  ok: true;
  trackId: string;
  groupKey: string;
  sort: ThreadSort;
  meta: ThreadMetaDTO | null;
  roots: Array<{ rootId: string; comments: CommentDTO[] }>;
  identities: Record<string, IdentityDTO>;
  viewer: { kind: "anon" | "member" };
};

type ThreadApiErr = { ok: false; error: string };

type CommentPostOk = {
  ok: true;
  trackId: string;
  groupKey: string;
  comment: CommentDTO;
  meta: ThreadMetaDTO;
  identities: Record<string, IdentityDTO>;
};

type VoteOk = {
  ok: true;
  commentId: string;
  viewerHasVoted: boolean;
  voteCount: number;
};
type VoteErr = { ok: false; error: string };

function deriveGroupKey(lineKey: string): string {
  return `lk:${lineKey.trim()}`;
}

export default function ExegesisTrackClient(props: {
  trackId: string;
  lyrics: LyricsApiOk;
}) {
  const trackId = (props.trackId ?? "").trim();
  const lyrics = props.lyrics;

  const [selected, setSelected] = React.useState<{
    lineKey: string;
    lineText: string;
    tMs: number;
    groupKey: string;
  } | null>(null);

  const [thread, setThread] = React.useState<ThreadApiOk | null>(null);
  const [threadErr, setThreadErr] = React.useState<string>("");
  const [sort, setSort] = React.useState<ThreadSort>("top");
  const [draft, setDraft] = React.useState<string>("");
  const [posting, setPosting] = React.useState<boolean>(false);

  React.useEffect(() => {
    const first = lyrics.cues?.[0];
    if (!first) return;
    setSelected({
      lineKey: first.lineKey,
      lineText: first.text,
      tMs: first.tMs,
      groupKey: deriveGroupKey(first.lineKey),
    });
  }, [lyrics.trackId, lyrics.cues]); // stable per track

  React.useEffect(() => {
    let alive = true;

    async function run() {
      if (!selected) return;
      setThreadErr("");
      setThread(null);

      const url =
        `/api/exegesis/thread?trackId=${encodeURIComponent(trackId)}` +
        `&groupKey=${encodeURIComponent(selected.groupKey)}` +
        `&sort=${encodeURIComponent(sort)}`;

      const r = await fetch(url, { cache: "no-store" });
      const j = (await r.json()) as ThreadApiOk | ThreadApiErr;
      if (!alive) return;

      if (!j.ok) {
        setThreadErr(j.error || "Failed to load thread.");
        return;
      }
      setThread(j);
    }

    void run();
    return () => {
      alive = false;
    };
  }, [trackId, selected?.groupKey, sort, selected]);

  async function postComment() {
    if (!selected) return;
    const text = draft.trim();
    if (!text) return;

    setPosting(true);
    try {
      const r = await fetch("/api/exegesis/comment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          trackId,
          lineKey: selected.lineKey,
          parentId: null,
          bodyPlain: text,
          bodyRich: null, // TipTap later
          tMs: selected.tMs,
          lineTextSnapshot: selected.lineText,
          lyricsVersion: lyrics.version ?? null,
        }),
      });

      const j = (await r.json()) as
        | CommentPostOk
        | { ok: false; error: string };
      if (!j.ok) {
        setThreadErr(j.error || "Failed to post comment.");
        return;
      }

      setDraft("");

      setThread((prev) => {
        const newRoot = { rootId: j.comment.rootId, comments: [j.comment] };

        // If thread wasn't loaded yet (prev null), bootstrap it so the user sees their post immediately.
        if (!prev) {
          return {
            ok: true,
            trackId: j.trackId,
            groupKey: j.groupKey,
            sort,
            meta: j.meta,
            roots: [newRoot],
            identities: { ...j.identities },
            viewer: { kind: "member" as const }, // posting implies member
          };
        }

        // If thread exists but is for a different selection, don't mutate it.
        if (prev.trackId !== j.trackId || prev.groupKey !== j.groupKey)
          return prev;

        return {
          ...prev,
          meta: j.meta,
          roots: [newRoot, ...prev.roots],
          identities: { ...prev.identities, ...j.identities },
        };
      });

      // optional: reconcile with server truth (ordering, vote counts, etc.)
      const url =
        `/api/exegesis/thread?trackId=${encodeURIComponent(trackId)}` +
        `&groupKey=${encodeURIComponent(j.groupKey)}` +
        `&sort=${encodeURIComponent(sort)}`;
      fetch(url, { cache: "no-store" })
        .then((r) => r.json())
        .then((jj) => {
          if (jj && jj.ok) setThread(jj);
        })
        .catch(() => {});
    } finally {
      setPosting(false);
    }
  }

  async function toggleVote(commentId: string) {
    if (!thread) return;

    // optimistic
    setThread((prev) => {
      if (!prev) return prev;
      const roots = prev.roots.map((r) => ({
        ...r,
        comments: r.comments.map((c) => {
          if (c.id !== commentId) return c;
          const nextHas = !c.viewerHasVoted;
          const nextCount = Math.max(0, c.voteCount + (nextHas ? 1 : -1));
          return { ...c, viewerHasVoted: nextHas, voteCount: nextCount };
        }),
      }));
      return { ...prev, roots };
    });

    const r = await fetch("/api/exegesis/vote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ commentId }),
    });

    const j = (await r.json()) as VoteOk | VoteErr;
    if (!j.ok) {
      setThreadErr(j.error || "Vote failed.");

      // refetch authoritative thread
      if (selected) {
        const url =
          `/api/exegesis/thread?trackId=${encodeURIComponent(trackId)}` +
          `&groupKey=${encodeURIComponent(selected.groupKey)}` +
          `&sort=${encodeURIComponent(sort)}`;
        const rr = await fetch(url, { cache: "no-store" });
        const jj = (await rr.json()) as ThreadApiOk | ThreadApiErr;
        if (jj.ok) setThread(jj);
      }
      return;
    }

    setThread((prev) => {
      if (!prev) return prev;
      const roots = prev.roots.map((r) => ({
        ...r,
        comments: r.comments.map((c) =>
          c.id === j.commentId
            ? { ...c, viewerHasVoted: j.viewerHasVoted, voteCount: j.voteCount }
            : c,
        ),
      }));
      return { ...prev, roots };
    });
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Keep your scaffold header info */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-xs opacity-60 tracking-[0.14em]">EXEGESIS</div>
          <h1 className="mt-1 text-xl font-semibold">
            Track: <span className="opacity-90">{lyrics.trackId}</span>
          </h1>
          <div className="mt-1 text-sm opacity-70">
            Lyrics version: {lyrics.version} · Offset: {lyrics.offsetMs}ms
          </div>
          {lyrics.geniusUrl ? (
            <div className="mt-1 text-sm opacity-75">
              <a
                href={lyrics.geniusUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                Genius link
              </a>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <button
            className={`rounded-md px-3 py-1.5 text-sm ${sort === "top" ? "bg-white/10" : "bg-white/5"}`}
            onClick={() => setSort("top")}
          >
            Top
          </button>
          <button
            className={`rounded-md px-3 py-1.5 text-sm ${sort === "recent" ? "bg-white/10" : "bg-white/5"}`}
            onClick={() => setSort("recent")}
          >
            Recent
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_420px]">
        {/* Lyrics */}
        <div className="rounded-xl bg-white/5 p-4">
          <div className="text-sm opacity-70">Lyrics</div>
          <div className="mt-3 space-y-1">
            {(lyrics.cues ?? []).map((c) => {
              const active = selected?.lineKey === c.lineKey;
              return (
                <button
                  key={c.lineKey}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm transition ${
                    active ? "bg-white/10" : "bg-transparent hover:bg-white/5"
                  }`}
                  onClick={() =>
                    setSelected({
                      lineKey: c.lineKey,
                      lineText: c.text,
                      tMs: c.tMs,
                      groupKey: deriveGroupKey(c.lineKey),
                    })
                  }
                >
                  <div className="text-[11px] opacity-55">
                    {c.lineKey} · {c.tMs}ms
                  </div>
                  <div className="mt-0.5 opacity-90">{c.text}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Thread */}
        <div className="rounded-xl bg-white/5 p-4">
          <div className="text-sm opacity-70">Thread</div>

          {selected ? (
            <div className="mt-2 rounded-md bg-black/20 p-3 text-sm">
              <div className="opacity-70">Selected line</div>
              <div className="mt-1">{selected.lineText}</div>
            </div>
          ) : null}

          {threadErr ? (
            <div className="mt-3 rounded-md bg-white/5 p-3 text-sm">
              {threadErr}
            </div>
          ) : null}

          <div className="mt-3 space-y-3">
            {(thread?.roots ?? []).length === 0 ? (
              <div className="text-sm opacity-60">No comments yet.</div>
            ) : (
              (thread?.roots ?? []).map((root) => (
                <div key={root.rootId} className="rounded-md bg-black/20 p-3">
                  {root.comments.map((c) => {
                    const ident = thread?.identities?.[c.createdByMemberId];
                    const name =
                      ident?.publicName || ident?.anonLabel || "Anonymous";

                    return (
                      <div key={c.id} className="py-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs opacity-70">{name}</div>
                          <button
                            className="rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
                            onClick={() => void toggleVote(c.id)}
                            title="Vote"
                          >
                            {c.viewerHasVoted ? "Voted" : "Vote"} ·{" "}
                            {c.voteCount}
                          </button>
                        </div>
                        <div className="mt-1 text-sm">{c.bodyPlain}</div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Composer */}
          <div className="mt-4">
            <textarea
              className="min-h-[90px] w-full rounded-md bg-black/20 p-3 text-sm outline-none"
              placeholder="Write an interpretation… (Patron/Partner)"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="text-xs opacity-60">
                {draft.trim().length}/5000
              </div>
              <button
                className="rounded-md bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15 disabled:opacity-40"
                disabled={!selected || !draft.trim() || posting}
                onClick={() => void postComment()}
              >
                {posting ? "Posting…" : "Post"}
              </button>
            </div>
            {thread?.viewer?.kind === "anon" ? (
              <div className="mt-2 text-xs opacity-60">
                Tip: sign in to vote; upgrade to post.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
