// web/app/(site)/exegesis/[recordingId]/components/ExegesisCommentItem.tsx
"use client";

import React from "react";
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

function TickIcon(props: { size?: number; stroke?: string }) {
  const { size = 14, stroke = "rgba(255,255,255,0.92)" } = props;

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
      <path
        d="M20 6L9 17l-5-5"
        stroke={stroke}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ExegesisCommentItem(props: {
  comment: CommentDTO;
  commenterName: string;
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
  onChangeEditDraft: (commentId: string, next: EditDraft) => void;
  onChangeReplyDraft: (commentId: string, next: ReplyDraft) => void;
  onChangeReportDraft: (commentId: string, next: ReportDraft) => void;
  editWrapRef?: React.Ref<HTMLDivElement>;
  replyWrapRef?: React.Ref<HTMLDivElement>;
  reportWrapRef?: React.Ref<HTMLDivElement>;
}) {
  const {
    comment: c,
    commenterName,
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

  const ago = formatAgo(c.createdAt);
  const votes = Math.max(0, c.voteCount ?? 0);
  const showBadge = votes > 0;
  const tier = medalTier(votes);
  const tint = votes > 0 ? medalClassForTier(tier) : "text-white/80";
  const voteDisabled = !canVote;

  return (
    <div
      id={`exegesis-c-${c.id}`}
      className={[
        "group py-2 scroll-mt-4",
        isAdminAuthor ? "relative" : "",
      ].join(" ")}
      style={{
        paddingLeft: Math.min(72, (c.depth ?? 0) * 12),
        borderLeft:
          (c.depth ?? 0) > 0 ? "1px solid rgba(255,255,255,0.08)" : "none",
        marginLeft: (c.depth ?? 0) > 0 ? 6 : 0,
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div
            className={
              isAdminAuthor
                ? "text-xs font-medium text-[var(--lxSelected)]"
                : "text-xs opacity-70"
            }
          >
            {commenterName}
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
              <TickIcon size={12} stroke="var(--bg)" />
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
                className="rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
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
                className="rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
                onClick={() => onOpenReport(c.id)}
                title="Report"
                aria-label="Report"
              >
                <ShieldAlertIcon className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <button
            className={`group relative inline-flex items-center justify-center rounded-md px-2 py-1 text-xs ${
              voteDisabled ? "opacity-70" : ""
            } ${tint}
[--voteBgRgb:17_17_17] hover:[--voteBgRgb:22_22_22]
bg-[rgb(var(--voteBgRgb)/0.55)] hover:bg-[rgb(var(--voteBgRgb)/0.55)]`}
            disabled={voteDisabled}
            onClick={voteDisabled ? undefined : () => onToggleVote(c.id)}
            title={
              voteDisabled
                ? viewerKind === "anon"
                  ? "Sign in to vote"
                  : "Friend tier or higher required to vote"
                : "Vote"
            }
            aria-label="Vote"
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

      {c.status === "hidden" ? (
        <div className="mt-1 text-sm opacity-60 italic">
          This comment is hidden.
        </div>
      ) : (
        <div className={isAdminAuthor ? "mt-1 text-white/95" : "mt-1"}>
          {isTipTapDoc(c.bodyRich) ? (
            <TipTapReadOnly doc={c.bodyRich} />
          ) : (
            <div className="text-sm whitespace-pre-wrap">{c.bodyPlain}</div>
          )}

          {canEdit && isAuthor ? (
            <div className="mt-1 flex items-center">
              <button
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
      )}

      {canPost && !isLocked && canEdit && editDraft?.open ? (
        <div ref={editWrapRef} className="mt-2 rounded-md bg-black/25 p-3">
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
                ...editDraft,
                plain,
                err: "",
              })
            }
            onChangeDoc={(doc) =>
              onChangeEditDraft(c.id, {
                ...editDraft,
                doc,
                err: "",
              })
            }
            onToggleToolbar={() =>
              onChangeEditDraft(c.id, {
                ...editDraft,
                ui: (editDraft.ui ?? "basic") === "full" ? "basic" : "full",
              })
            }
            onSubmit={() => onSubmitEdit(c)}
          />
        </div>
      ) : null}

      {canPost && !isLocked && replyDraft?.open ? (
        <div ref={replyWrapRef} className="mt-2 rounded-md bg-black/25 p-3">
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
                ...replyDraft,
                plain,
                err: "",
              })
            }
            onChangeDoc={(doc) =>
              onChangeReplyDraft(c.id, {
                ...replyDraft,
                doc,
                err: "",
              })
            }
            onToggleToolbar={() =>
              onChangeReplyDraft(c.id, {
                ...replyDraft,
                ui: (replyDraft.ui ?? "basic") === "full" ? "basic" : "full",
              })
            }
            onSubmit={() => onSubmitReply(c)}
          />
        </div>
      ) : null}

      {canReport && reportDraft?.open ? (
        <ExegesisReportForm
          containerRef={reportWrapRef}
          draft={reportDraft}
          onChange={(next) => onChangeReportDraft(c.id, next)}
          onSubmit={() => onSubmitReport(c.id)}
        />
      ) : null}
    </div>
  );
}
