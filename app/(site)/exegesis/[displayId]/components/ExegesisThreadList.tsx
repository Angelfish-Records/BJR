// web/app/(site)/exegesis/[displayId]/components/ExegesisThreadList.tsx
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
import {
  exegesisCommentEditExpiresAtMs,
  isExegesisCommentEditWindowOpen,
} from "@/lib/exegesis/commentPolicy";

type CommentTreeNode = {
  comment: CommentDTO;
  children: CommentTreeNode[];
};

const THREAD_RAIL_COLORS = [
  "rgba(98,78,113,0.46)",
  "rgba(103,119,124,0.30)",
  "rgba(255,255,255,0.10)",
] as const;

function railColorForDepth(depth: number): string {
  const index = Math.max(0, depth - 1) % THREAD_RAIL_COLORS.length;
  return THREAD_RAIL_COLORS[index];
}

function buildCommentForest(comments: CommentDTO[]): CommentTreeNode[] {
  const nodeById = new Map<string, CommentTreeNode>();

  for (const comment of comments) {
    nodeById.set(comment.id, {
      comment,
      children: [],
    });
  }

  const forest: CommentTreeNode[] = [];

  for (const comment of comments) {
    const node = nodeById.get(comment.id);
    if (!node) continue;

    const parentId = (comment.parentId ?? "").trim();
    const parent = parentId ? nodeById.get(parentId) : undefined;

    if (parent && parent !== node) {
      parent.children.push(node);
    } else {
      forest.push(node);
    }
  }

  return forest;
}

export default function ExegesisThreadList(
  props: Readonly<{
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
    rootElByIdRef: React.MutableRefObject<
      Record<string, HTMLDivElement | null>
    >;
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
    onChangeEditDraft: (commentId: string, patch: Partial<EditDraft>) => void;
    onChangeReplyDraft: (commentId: string, patch: Partial<ReplyDraft>) => void;
    onChangeReportDraft: (commentId: string, next: ReportDraft) => void;
    onFocusRoot: (rootId: string) => void;
  }>,
) {
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

  const [editClockMs, setEditClockMs] = React.useState(
    () => Date.now(),
  );

  React.useEffect(() => {
    const nowMs = Date.now();
    const timeoutIds: number[] = [];

    timeoutIds.push(
      globalThis.window.setTimeout(() => {
        setEditClockMs(Date.now());
      }, 0),
    );

    if (viewerMemberId) {
      for (const root of roots ?? []) {
        for (const comment of root.comments ?? []) {
          if (
            comment.createdByMemberId !== viewerMemberId ||
            comment.status !== "live"
          ) {
            continue;
          }

          const expiresAtMs = exegesisCommentEditExpiresAtMs(
            comment.createdAt,
          );

          if (expiresAtMs === null || expiresAtMs <= nowMs) {
            continue;
          }

          timeoutIds.push(
            globalThis.window.setTimeout(
              () => {
                setEditClockMs(Date.now());
              },
              Math.max(0, expiresAtMs - nowMs + 50),
            ),
          );
        }
      }
    }

    return () => {
      for (const timeoutId of timeoutIds) {
        globalThis.window.clearTimeout(timeoutId);
      }
    };
  }, [roots, viewerMemberId]);

  if ((roots ?? []).length === 0) {
    return (
      <div className="text-sm opacity-60">
        {focusedRootId ? "Thread not found." : "No comments yet."}
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

        const commentForest = buildCommentForest(visibleComments);
        let surfaceIndex = 0;

        const renderCommentNode = (
          node: CommentTreeNode,
          visualDepth: number,
        ): React.ReactNode => {
          const c = node.comment;
          const commentSurfaceIndex = surfaceIndex;
          surfaceIndex += 1;

          const ident = identities?.[c.createdByMemberId];
          const authorIdentity = resolveAuthorDisplayIdentity(
            identityFactsFromDTO(ident),
          );
          const replyBusy = Boolean(replyByCommentId[c.id]?.posting);
          const isAuthor =
            Boolean(viewerMemberId) &&
            c.createdByMemberId === viewerMemberId;
          const canEdit =
            canPost &&
            !isLocked &&
            isAuthor &&
            c.status === "live" &&
            isExegesisCommentEditWindowOpen(c.createdAt, editClockMs);
          const editBusy = Boolean(editByCommentId[c.id]?.posting);

          const childDepth = visualDepth + 1;

          return (
            <div key={c.id}>
              <ExegesisCommentItem
                comment={c}
                surfaceIndex={commentSurfaceIndex}
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

              {node.children.length > 0 ? (
                <div
                  style={{
                    marginLeft: 5,
                    paddingLeft: 7,
                    borderLeft: `1px solid ${railColorForDepth(childDepth)}`,
                  }}
                >
                  {node.children.map((child) =>
                    renderCommentNode(child, childDepth),
                  )}
                </div>
              ) : null}
            </div>
          );
        };

        return (
          <div
            key={root.rootId}
            ref={(el) => {
              rootElByIdRef.current[root.rootId] = el;
            }}
            className="rounded-md bg-black/20"
          >
            {commentForest.map((node) => renderCommentNode(node, 0))}

            {gated ? (
              <div
                className="mt-2"
                style={{
                  marginLeft: Math.min(72, previewMaxDepth * 12),
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
