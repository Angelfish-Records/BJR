// web/app/(site)/exegesis/[recordingId]/components/ExegesisThreadList.tsx
"use client";

import React from "react";
import ExegesisCommentItem from "./ExegesisCommentItem";
import type {
  CommentDTO,
  EditDraft,
  ReplyDraft,
  ReportDraft,
  ThreadApiOk,
} from "../exegesisTypes";
import { resolveAuthorDisplayIdentity } from "@/lib/memberIdentity";
import { identityFactsFromDTO } from "../exegesisIdentity";

export default function ExegesisThreadList(props: {
  roots: Array<ThreadApiOk["roots"][number]>;
  identities: ThreadApiOk["identities"] | undefined;
  focusedRootId: string;
  viewerMemberId: string;
  viewerKind: "anon" | "member";
  canPost: boolean;
  canReport: boolean;
  canVote: boolean;
  isLocked: boolean;
  replyByCommentId: Record<string, ReplyDraft>;
  editByCommentId: Record<string, EditDraft>;
  reportByCommentId: Record<string, ReportDraft>;
  replyMountKey: number;
  editMountKey: number;
  previewMaxDepth: number;
  previewMaxComments: number;
  rootElByIdRef: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  editWrapByIdRef: React.MutableRefObject<
    Record<string, HTMLDivElement | null>
  >;
  replyWrapByIdRef: React.MutableRefObject<
    Record<string, HTMLDivElement | null>
  >;
  reportWrapByIdRef: React.MutableRefObject<
    Record<string, HTMLDivElement | null>
  >;
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
  onFocusRoot: (rootId: string) => void;
}) {
  const {
    roots,
    identities,
    focusedRootId,
    viewerMemberId,
    viewerKind,
    canPost,
    canReport,
    canVote,
    isLocked,
    replyByCommentId,
    editByCommentId,
    reportByCommentId,
    replyMountKey,
    editMountKey,
    previewMaxDepth,
    previewMaxComments,
    rootElByIdRef,
    editWrapByIdRef,
    replyWrapByIdRef,
    reportWrapByIdRef,
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
    onFocusRoot,
  } = props;

  if ((roots ?? []).length === 0) {
    return (
      <div className="text-sm opacity-60">
        {focusedRootId ? "Thread not found." : "Be the first to comment."}
      </div>
    );
  }

  return (
    <>
      {(roots ?? []).map((root) => {
        const allComments = root.comments ?? [];
        const previewComments = allComments
          .filter((c) => (c.depth ?? 0) <= previewMaxDepth)
          .slice(0, previewMaxComments);

        const isFocused = Boolean(focusedRootId);
        const visibleComments = isFocused ? allComments : previewComments;

        const gated =
          !isFocused &&
          (allComments.some((c) => (c.depth ?? 0) > previewMaxDepth) ||
            previewComments.length < allComments.length);

        return (
          <div
            key={root.rootId}
            ref={(el) => {
              rootElByIdRef.current[root.rootId] = el;
            }}
            className="rounded-md bg-black/20"
          >
            {visibleComments.map((c) => {
              const ident = identities?.[c.createdByMemberId];
              const authorIdentity = resolveAuthorDisplayIdentity(
                identityFactsFromDTO(ident),
              );
              const replyBusy = Boolean(replyByCommentId[c.id]?.posting);
              const isAuthor =
                Boolean(viewerMemberId) &&
                c.createdByMemberId === viewerMemberId;
              const canEdit =
                canPost && !isLocked && isAuthor && c.status === "live";
              const editBusy = Boolean(editByCommentId[c.id]?.posting);

              return (
                <ExegesisCommentItem
                  key={c.id}
                  comment={c}
                  authorLabel={authorIdentity.displayName}
                  isAdminAuthor={authorIdentity.isAdmin}
                  canPost={canPost}
                  canReport={canReport}
                  canVote={canVote}
                  isLocked={isLocked}
                  isAuthor={isAuthor}
                  canEdit={canEdit}
                  replyBusy={replyBusy}
                  editBusy={editBusy}
                  viewerKind={viewerKind}
                  replyDraft={replyByCommentId[c.id]}
                  editDraft={editByCommentId[c.id]}
                  reportDraft={reportByCommentId[c.id]}
                  replyMountKey={replyMountKey}
                  editMountKey={editMountKey}
                  onOpenReply={onOpenReply}
                  onOpenReport={onOpenReport}
                  onToggleVote={onToggleVote}
                  onOpenEdit={onOpenEdit}
                  onSubmitEdit={onSubmitEdit}
                  onSubmitReply={onSubmitReply}
                  onSubmitReport={onSubmitReport}
                  onChangeEditDraft={onChangeEditDraft}
                  onChangeReplyDraft={onChangeReplyDraft}
                  onChangeReportDraft={onChangeReportDraft}
                  editWrapRef={(el) => {
                    editWrapByIdRef.current[c.id] = el;
                  }}
                  replyWrapRef={(el) => {
                    replyWrapByIdRef.current[c.id] = el;
                  }}
                  reportWrapRef={(el) => {
                    reportWrapByIdRef.current[c.id] = el;
                  }}
                />
              );
            })}

            {gated ? (
              <div
                className="mt-2"
                style={{
                  paddingLeft: Math.min(72, 3 * 12),
                  borderLeft: "1px solid rgba(255,255,255,0.08)",
                  marginLeft: 6,
                }}
              >
                <button
                  type="button"
                  className="inline-flex items-center rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
                  onClick={() => onFocusRoot(root.rootId)}
                >
                  Open full thread
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
