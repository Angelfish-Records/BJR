// web/app/(site)/exegesis/[displayId]/components/ExegesisCommentItem.tsx
"use client";

import React from "react";
import { performShare } from "@/lib/share";
import TipTapReadOnly from "../TipTapReadOnly";
import { MedalIcon, ReplyIcon, ShieldAlertIcon } from "../icons";
import ExegesisReportForm from "./ExegesisReportForm";
import ExegesisRichComposer from "./ExegesisRichComposer";
import type {
  CommentDTO,
  EditDraft,
  ReplyDraft,
  ReportDraft,
} from "../exegesisTypes";
import {
  formatAgo,
  isTipTapDoc,
  medalClassForTier,
  medalTier,
} from "../exegesisUi";

type TickIconProps = Readonly<{
  size?: number;
}>;

type ExegesisCommentItemProps = Readonly<{
  comment: CommentDTO;
  surfaceIndex: number;
  authorLabel: string;
  isAdminAuthor: boolean;
  canPost: boolean;
  canReport: boolean;
  canVote: boolean;
  isLocked: boolean;
  isAuthor: boolean;
  canEdit: boolean;
  replyBusy: boolean;
  editBusy: boolean;
  viewerKind: "anon" | "member";
  replyDraft?: ReplyDraft;
  editDraft?: EditDraft;
  reportDraft?: ReportDraft;
  replyMountKey: number;
  editMountKey: number;
  onOpenReply: (commentId: string) => void;
  onOpenReport: (commentId: string) => void;
  onToggleVote: (commentId: string) => void;
  onOpenEdit: (comment: CommentDTO) => void;
  onSubmitEdit: (comment: CommentDTO) => void;
  onSubmitReply: (comment: CommentDTO) => void;
  onSubmitReport: (commentId: string) => void;
  onChangeEditDraft: (commentId: string, patch: Partial<EditDraft>) => void;
  onChangeReplyDraft: (commentId: string, patch: Partial<ReplyDraft>) => void;
  onChangeReportDraft: (commentId: string, next: ReportDraft) => void;
  editWrapRef?: React.Ref<HTMLDivElement>;
  replyWrapRef?: React.Ref<HTMLDivElement>;
  reportWrapRef?: React.Ref<HTMLDivElement>;
}>;

type CommentHeaderProps = Readonly<
  Pick<
    ExegesisCommentItemProps,
    | "comment"
    | "authorLabel"
    | "isAdminAuthor"
    | "canPost"
    | "canReport"
    | "canVote"
    | "isLocked"
    | "isAuthor"
    | "replyBusy"
    | "viewerKind"
    | "onOpenReply"
    | "onOpenReport"
    | "onToggleVote"
  >
>;

type CommentBodyProps = Readonly<
  Pick<
    ExegesisCommentItemProps,
    | "comment"
    | "isAdminAuthor"
    | "canEdit"
    | "isAuthor"
    | "editBusy"
    | "replyBusy"
    | "onOpenEdit"
  >
>;

type EditComposerSectionProps = Readonly<
  Pick<
    ExegesisCommentItemProps,
    | "comment"
    | "canPost"
    | "isLocked"
    | "canEdit"
    | "editDraft"
    | "editMountKey"
    | "onSubmitEdit"
    | "onChangeEditDraft"
    | "editWrapRef"
  >
>;

type ReplyComposerSectionProps = Readonly<
  Pick<
    ExegesisCommentItemProps,
    | "comment"
    | "canPost"
    | "isLocked"
    | "replyDraft"
    | "replyMountKey"
    | "onSubmitReply"
    | "onChangeReplyDraft"
    | "replyWrapRef"
  >
>;

type ReportSectionProps = Readonly<
  Pick<
    ExegesisCommentItemProps,
    | "comment"
    | "canReport"
    | "reportDraft"
    | "onSubmitReport"
    | "onChangeReportDraft"
    | "reportWrapRef"
  >
>;

function TickIcon(props: TickIconProps) {
  const { size = 14 } = props;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block" }}
    >
      {/* punch-out stroke */}
      <path
        d="M20 6L9 17l-5-5"
        stroke="var(--lxSelected)"
        strokeWidth="4.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* visible tick */}
      <path
        d="M20 6L9 17l-5-5"
        stroke="rgba(0,0,0,0.92)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type ShareIconProps = Readonly<{
  className?: string;
}>;

function ShareIcon(props: ShareIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={props.className}
    >
      <circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="2" />
      <circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="2" />
      <path
        d="m8.7 10.7 6.6-4.2M8.7 13.3l6.6 4.2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function commentShareUrl(comment: CommentDTO): string | null {
  if (globalThis.window === undefined) return null;

  // Deliberately build from the canonical visible path rather than the
  // current query string so transient params/share tokens are not leaked.
  const url = new URL(
    globalThis.window.location.pathname,
    globalThis.window.location.origin,
  );

  const hash = new URLSearchParams();
  hash.set("l", comment.lineKey);
  hash.set("c", comment.id);
  hash.set("root", comment.rootId);

  url.hash = hash.toString();
  return url.toString();
}

function compactCommentShareText(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= 180) return compact;

  return `${compact.slice(0, 177).trimEnd()}…`;
}

function CommentShareAction(
  props: Readonly<{
    comment: CommentDTO;
    authorLabel: string;
  }>,
) {
  const { comment, authorLabel } = props;
  const [copied, setCopied] = React.useState(false);
  const copiedTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) {
        globalThis.window.clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  async function shareComment() {
    const url = commentShareUrl(comment);
    if (!url) return;

    const excerpt = compactCommentShareText(comment.bodyPlain);

    try {
      const result = await performShare({
        title: `Exegesis comment · ${authorLabel}`,
        text: excerpt
          ? `${authorLabel}: “${excerpt}”`
          : `View a comment by ${authorLabel} in Exegesis.`,
        url,
      });

      // Native sharing supplies its own OS-level confirmation. For the
      // clipboard fallback, give a brief local acknowledgement.
      if (!result.ok || result.method !== "copy") return;

      setCopied(true);

      if (copiedTimerRef.current !== null) {
        globalThis.window.clearTimeout(copiedTimerRef.current);
      }

      copiedTimerRef.current = globalThis.window.setTimeout(() => {
        setCopied(false);
        copiedTimerRef.current = null;
      }, 1400);
    } catch {
      // Sharing is deliberately non-destructive. A browser-level share
      // failure must not affect the comment or surrounding thread.
    }
  }

  const label = copied ? "Link copied" : "Share comment";

  return (
    <button
      type="button"
      className={[
        "absolute bottom-2 right-2 inline-flex h-7 w-7 items-center justify-center rounded-full",
        "bg-black/25 text-white/55 ring-1 ring-white/[0.06]",
        "transition-[opacity,color,background-color,box-shadow] duration-150 ease-out",
        "hover:bg-black/40 hover:text-white/85 hover:ring-white/[0.12]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25",
        "md:pointer-events-none md:opacity-0",
        "md:group-hover:pointer-events-auto md:group-hover:opacity-100",
        "group-focus-within:pointer-events-auto group-focus-within:opacity-100",
      ].join(" ")}
      onClick={() => void shareComment()}
      title={label}
      aria-label={label}
    >
      {copied ? (
        <span
          className="text-sm font-semibold leading-none"
          aria-hidden="true"
        >
          ✓
        </span>
      ) : (
        <ShareIcon className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function voteTitle(
  canVote: boolean,
  viewerKind: ExegesisCommentItemProps["viewerKind"],
  isAuthor: boolean,
): string {
  if (isAuthor) return "You can't vote on your own comment";
  if (canVote) return "Vote";
  if (viewerKind === "anon") return "Sign in to vote";
  return "Friend tier or higher required to vote";
}

const COMMENT_SURFACE_COLORS = [
  "rgb(40 31 46)",
  "rgb(29 33 35)",
  "rgb(37 35 39)",
] as const;

function commentSurfaceForIndex(surfaceIndex: number): string {
  const index = Math.max(0, surfaceIndex) % COMMENT_SURFACE_COLORS.length;
  return COMMENT_SURFACE_COLORS[index];
}

function CommentHeader(props: CommentHeaderProps) {
  const {
    comment: c,
    authorLabel,
    isAdminAuthor,
    canPost,
    canReport,
    canVote,
    isLocked,
    isAuthor,
    replyBusy,
    viewerKind,
    onOpenReply,
    onOpenReport,
    onToggleVote,
  } = props;

  const ago = formatAgo(c.createdAt);
  const votes = Math.max(0, c.voteCount ?? 0);
  const showBadge = votes > 0;
  const tier = medalTier(votes);
  const tint = votes > 0 ? medalClassForTier(tier) : "text-white/80";
  const voteDisabled = !canVote || isAuthor;
  const title = voteTitle(canVote, viewerKind, isAuthor);

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <div
          className={
            isAdminAuthor
              ? "text-xs font-semibold text-[var(--lxSelected)]"
              : "text-xs opacity-70"
          }
        >
          {authorLabel}
        </div>

        {isAdminAuthor ? (
          <div
            className="flex items-center justify-center rounded-full"
            style={{
              width: 16,
              height: 16,
              background: "var(--lxSelected)",
            }}
            title="Artist"
          >
            <TickIcon size={12} />
          </div>
        ) : null}

        {ago ? <div className="text-[11px] opacity-45">· {ago}</div> : null}

        {c.editedAt || (c.editCount ?? 0) > 0 ? (
          <div className="text-[11px] opacity-50">edited</div>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 md:opacity-0 transition-opacity duration-150 ease-out md:group-hover:opacity-100 group-focus-within:opacity-100">
          {canPost && !isLocked ? (
            <button
              type="button"
              className="rounded-md bg-white/[0.04] px-2 py-1 text-xs text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white/85 disabled:opacity-40"
              disabled={replyBusy || c.status !== "live" || c.depth >= 6}
              onClick={() => onOpenReply(c.id)}
              title={c.depth >= 6 ? "Max thread depth reached" : "Reply"}
              aria-label="Reply"
            >
              <ReplyIcon className="h-4 w-4" />
            </button>
          ) : null}

          {canReport ? (
            <button
              type="button"
              className="rounded-md bg-white/[0.04] px-2 py-1 text-xs text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white/85"
              onClick={() => onOpenReport(c.id)}
              title="Report"
              aria-label="Report"
            >
              <ShieldAlertIcon className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <button
          type="button"
          className={`group relative inline-flex items-center justify-center rounded-md px-2 py-1 text-xs ${
            voteDisabled ? "opacity-70" : ""
          } ${tint}
[--voteBgRgb:17_17_17] hover:[--voteBgRgb:22_22_22]
bg-[rgb(var(--voteBgRgb)/0.55)] hover:bg-[rgb(var(--voteBgRgb)/0.55)]`}
          disabled={voteDisabled}
          onClick={voteDisabled ? undefined : () => onToggleVote(c.id)}
          title={title}
          aria-label={title}
        >
          <span className="relative inline-flex h-4 w-4 items-center justify-center">
            <MedalIcon className="h-4 w-4" />

            {showBadge ? (
              <span
                className="absolute text-[9px] font-black leading-[9px] tabular-nums text-current"
                style={{
                  right: "0px",
                  top: "-1px",
                  pointerEvents: "none",
                  WebkitTextStroke: "2px rgb(var(--voteBgRgb) / 0.55)",
                  paintOrder: "stroke fill",
                }}
              >
                {votes}
              </span>
            ) : null}
          </span>
        </button>
      </div>
    </div>
  );
}

function CommentBody(props: CommentBodyProps) {
  const {
    comment: c,
    isAdminAuthor,
    canEdit,
    isAuthor,
    editBusy,
    replyBusy,
    onOpenEdit,
  } = props;

  if (c.status === "hidden") {
    return (
      <div className="mt-1 text-sm opacity-60 italic">
        This comment is hidden.
      </div>
    );
  }

  return (
    <div
      className={
        isAdminAuthor
          ? "mt-1 pb-3 pr-9 text-white/95"
          : "mt-1 pb-3 pr-9"
      }
    >
      {isTipTapDoc(c.bodyRich) ? (
        <TipTapReadOnly doc={c.bodyRich} />
      ) : (
        <div className="text-sm whitespace-pre-wrap">{c.bodyPlain}</div>
      )}

      {canEdit && isAuthor ? (
        <div className="mt-1 flex items-center">
          <button
            type="button"
            className="rounded bg-white/0 px-1 py-0.5 text-[11px] opacity-70 hover:bg-white/5 hover:opacity-100 disabled:opacity-40"
            disabled={editBusy || replyBusy}
            onClick={() => onOpenEdit(c)}
            title="Edit"
          >
            Edit
          </button>
        </div>
      ) : null}
    </div>
  );
}

function EditComposerSection(props: EditComposerSectionProps) {
  const {
    comment: c,
    canPost,
    isLocked,
    canEdit,
    editDraft,
    editMountKey,
    onSubmitEdit,
    onChangeEditDraft,
    editWrapRef,
  } = props;

  if (!canPost || isLocked || !canEdit || !editDraft?.open) return null;

  return (
    <div
      ref={editWrapRef}
      className="mt-3 rounded-xl border border-white/8 bg-black/25 p-3 sm:p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs opacity-70">Edit</div>
      </div>

      <ExegesisRichComposer
        editorKey={`edit-${c.id}-${editMountKey}-${editDraft.ui ?? "basic"}`}
        valuePlain={editDraft.plain ?? ""}
        valueDoc={editDraft.doc ?? null}
        disabled={Boolean(editDraft.posting)}
        showToolbar={(editDraft.ui ?? "basic") === "full"}
        autofocus
        placeholder="Edit your comment…"
        error={editDraft.err ?? ""}
        posting={Boolean(editDraft.posting)}
        submitLabel="Save edit"
        submitDisabled={
          Boolean(editDraft.posting) || !(editDraft.plain ?? "").trim()
        }
        onChangePlain={(plain) =>
          onChangeEditDraft(c.id, {
            plain,
            err: "",
          })
        }
        onChangeDoc={(doc) =>
          onChangeEditDraft(c.id, {
            doc,
            err: "",
          })
        }
        onToggleToolbar={() =>
          onChangeEditDraft(c.id, {
            ui: (editDraft.ui ?? "basic") === "full" ? "basic" : "full",
          })
        }
        onSubmit={() => onSubmitEdit(c)}
      />
    </div>
  );
}

function ReplyComposerSection(props: ReplyComposerSectionProps) {
  const {
    comment: c,
    canPost,
    isLocked,
    replyDraft,
    replyMountKey,
    onSubmitReply,
    onChangeReplyDraft,
    replyWrapRef,
  } = props;

  if (!canPost || isLocked || !replyDraft?.open) return null;

  return (
    <div
      ref={replyWrapRef}
      className="mt-3 rounded-xl border border-white/8 bg-black/25 p-3 sm:p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs opacity-70">Reply</div>
      </div>

      <ExegesisRichComposer
        editorKey={`reply-${c.id}-${replyMountKey}-${replyDraft.ui ?? "basic"}`}
        valuePlain={replyDraft.plain ?? ""}
        valueDoc={replyDraft.doc ?? null}
        disabled={Boolean(replyDraft.posting)}
        showToolbar={(replyDraft.ui ?? "basic") === "full"}
        autofocus
        placeholder="Write a reply…"
        error={replyDraft.err ?? ""}
        posting={Boolean(replyDraft.posting)}
        submitLabel="Post reply"
        submitDisabled={
          Boolean(replyDraft.posting) || !(replyDraft.plain ?? "").trim()
        }
        onChangePlain={(plain) =>
          onChangeReplyDraft(c.id, {
            plain,
            err: "",
          })
        }
        onChangeDoc={(doc) =>
          onChangeReplyDraft(c.id, {
            doc,
            err: "",
          })
        }
        onToggleToolbar={() =>
          onChangeReplyDraft(c.id, {
            ui: (replyDraft.ui ?? "basic") === "full" ? "basic" : "full",
          })
        }
        onSubmit={() => onSubmitReply(c)}
      />
    </div>
  );
}

function ReportSection(props: ReportSectionProps) {
  const {
    comment: c,
    canReport,
    reportDraft,
    onSubmitReport,
    onChangeReportDraft,
    reportWrapRef,
  } = props;

  if (!canReport || !reportDraft?.open) return null;

  return (
    <div className="mt-3 rounded-xl border border-white/8 bg-black/20 p-3 sm:p-4">
      <ExegesisReportForm
        containerRef={reportWrapRef}
        draft={reportDraft}
        onChange={(next) => onChangeReportDraft(c.id, next)}
        onSubmit={() => onSubmitReport(c.id)}
      />
    </div>
  );
}

export default function ExegesisCommentItem(
  props: ExegesisCommentItemProps,
) {
  const {
    comment: c,
    surfaceIndex,
    authorLabel,
    isAdminAuthor,
    canPost,
    canReport,
    canVote,
    isLocked,
    isAuthor,
    canEdit,
    replyBusy,
    editBusy,
    viewerKind,
    replyDraft,
    editDraft,
    reportDraft,
    replyMountKey,
    editMountKey,
    onOpenReply,
    onOpenReport,
    onToggleVote,
    onOpenEdit,
    onSubmitEdit,
    onSubmitReply,
    onSubmitReport,
    onChangeEditDraft,
    onChangeReplyDraft,
    onChangeReportDraft,
    editWrapRef,
    replyWrapRef,
    reportWrapRef,
  } = props;

  if (c.status === "deleted") return null;

  const depth = Math.max(0, c.depth ?? 0);
  const surfaceColor = commentSurfaceForIndex(surfaceIndex);

  return (
    <div
      id={`exegesis-c-${c.id}`}
      className={[
        "group scroll-mt-4 py-0.5",
        isAdminAuthor ? "relative" : "",
      ].join(" ")}
      data-exegesis-depth={depth}
    >
      <div
        className="relative rounded-md px-4 py-2 sm:px-5"
        data-exegesis-comment-surface=""
        style={{ backgroundColor: surfaceColor }}
      >
        <div className="max-w-full">
          <CommentHeader
            comment={c}
            authorLabel={authorLabel}
            isAdminAuthor={isAdminAuthor}
            canPost={canPost}
            canReport={canReport}
            canVote={canVote}
            isLocked={isLocked}
            isAuthor={isAuthor}
            replyBusy={replyBusy}
            viewerKind={viewerKind}
            onOpenReply={onOpenReply}
            onOpenReport={onOpenReport}
            onToggleVote={onToggleVote}
          />

          <CommentBody
            comment={c}
            isAdminAuthor={isAdminAuthor}
            canEdit={canEdit}
            isAuthor={isAuthor}
            editBusy={editBusy}
            replyBusy={replyBusy}
            onOpenEdit={onOpenEdit}
          />

          <EditComposerSection
            comment={c}
            canPost={canPost}
            isLocked={isLocked}
            canEdit={canEdit}
            editDraft={editDraft}
            editMountKey={editMountKey}
            onSubmitEdit={onSubmitEdit}
            onChangeEditDraft={onChangeEditDraft}
            editWrapRef={editWrapRef}
          />

          <ReplyComposerSection
            comment={c}
            canPost={canPost}
            isLocked={isLocked}
            replyDraft={replyDraft}
            replyMountKey={replyMountKey}
            onSubmitReply={onSubmitReply}
            onChangeReplyDraft={onChangeReplyDraft}
            replyWrapRef={replyWrapRef}
          />

          <ReportSection
            comment={c}
            canReport={canReport}
            reportDraft={reportDraft}
            onSubmitReport={onSubmitReport}
            onChangeReportDraft={onChangeReportDraft}
            reportWrapRef={reportWrapRef}
          />
        </div>

        {c.status === "live" &&
        !editDraft?.open &&
        !replyDraft?.open &&
        !reportDraft?.open ? (
          <CommentShareAction
            comment={c}
            authorLabel={authorLabel}
          />
        ) : null}
      </div>
    </div>
  );
}