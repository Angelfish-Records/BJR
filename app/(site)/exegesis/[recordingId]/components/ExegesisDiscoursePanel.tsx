"use client";

import React from "react";
import ExegesisDiscourseShimmer from "./ExegesisDiscourseShimmer";
import ExegesisIdentityPanel from "./ExegesisIdentityPanel";
import ExegesisInlineGateOverlay from "./ExegesisInlineGateOverlay";
import ExegesisThreadList from "./ExegesisThreadList";
import type {
  CommentDTO,
  EditDraft,
  IdentityDTO,
  LyricsApiOk,
  ReplyDraft,
  ReportDraft,
  ThreadApiOk,
} from "../exegesisTypes";
import { cueCanonicalGroupKey, isSameGroup } from "../exegesisUi";

type SelectedLine = {
  lineKey: string;
  lineText: string;
  tMs: number;
  groupKey?: string;
};

type InlineGateState = {
  open: boolean;
  message: string;
  correlationId: string | null;
  dismissible: boolean;
};

export default function ExegesisDiscoursePanel(props: {
  isMobile: boolean;
  desktopPanelH: number;
  dockHeight: number;
  lyrics: LyricsApiOk;
  selected: SelectedLine | null;
  shouldShowInitialShimmer: boolean;
  isLocked: boolean;
  showIdentityPanel: boolean;
  canClaimName: boolean;
  identityLabel: string;
  viewerIdentity?: IdentityDTO;
  claimOpen: boolean;
  claimName: string;
  claimErr: string;
  claimBusy: boolean;
  threadErr: string;
  composer: React.ReactNode;
  focusedRootId: string;
  sort: "top" | "recent";
  threadScrollRef: React.Ref<HTMLDivElement>;
  roots: Array<ThreadApiOk["roots"][number]>;
  identities: ThreadApiOk["identities"] | undefined;
  viewerMemberId: string;
  viewerKind: "anon" | "member";
  canPost: boolean;
  canReport: boolean;
  canVote: boolean;
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
  inlineGate: InlineGateState;
  onClearRootFocus: () => void;
  onSetSortTop: () => void;
  onSetSortRecent: () => void;
  onToggleClaim: () => void;
  onChangeClaimName: (value: string) => void;
  onCancelClaim: () => void;
  onSubmitClaim: () => void;
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
  onDismissInlineGate: () => void;
}) {
  const {
    isMobile,
    desktopPanelH,
    dockHeight,
    lyrics,
    selected,
    shouldShowInitialShimmer,
    isLocked,
    showIdentityPanel,
    canClaimName,
    identityLabel,
    viewerIdentity,
    claimOpen,
    claimName,
    claimErr,
    claimBusy,
    threadErr,
    composer,
    focusedRootId,
    sort,
    threadScrollRef,
    roots,
    identities,
    viewerMemberId,
    viewerKind,
    canPost,
    canReport,
    canVote,
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
    inlineGate,
    onClearRootFocus,
    onSetSortTop,
    onSetSortRecent,
    onToggleClaim,
    onChangeClaimName,
    onCancelClaim,
    onSubmitClaim,
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
    onDismissInlineGate,
  } = props;

  return (
    <div
      className={
        isMobile
          ? "h-full bg-black p-4 flex flex-col"
          : "rounded-xl bg-white/5 p-4 flex flex-col"
      }
      style={
        isMobile
          ? undefined
          : desktopPanelH
            ? {
                maxHeight: desktopPanelH,
              }
            : undefined
      }
    >
      <div className="relative min-h-0 flex-1 flex flex-col">
        <div
          className={
            inlineGate.open
              ? "min-h-0 flex-1 flex flex-col blur-[1.5px] opacity-55 pointer-events-none select-none"
              : "min-h-0 flex-1 flex flex-col"
          }
        >
          {!selected ? (
            <div className="rounded-xl bg-white/5 p-4">
              <div className="text-sm opacity-70">
                Select a line to view the discussion.
              </div>
            </div>
          ) : shouldShowInitialShimmer ? (
            <ExegesisDiscourseShimmer />
          ) : (
            <>
              {isLocked ? (
                <div className="mt-2 rounded-md bg-white/5 p-3 text-sm">
                  <div className="opacity-80">This thread is locked.</div>
                  <div className="mt-1 text-xs opacity-60">
                    You can still read, but posting is disabled.
                  </div>
                </div>
              ) : null}

              {selected ? (
                <div className="mt-2 border-l-2 border-[var(--lxSelected)] bg-black/20 pl-3 text-sm">
                  {(() => {
                    const gk = (selected.groupKey ?? "").trim();
                    if (!gk) {
                      return <div className="py-1">{selected.lineText}</div>;
                    }

                    const lines = (lyrics.cues ?? [])
                      .filter((c) =>
                        isSameGroup(cueCanonicalGroupKey(lyrics, c), gk),
                      )
                      .map((c) => c.text);

                    const safe = lines.length > 0 ? lines : [selected.lineText];

                    return (
                      <div className="space-y-1 py-1">
                        {safe.map((t, i) => (
                          <div key={i}>{t}</div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              ) : null}

              {threadErr ? (
                <div className="mt-3 rounded-md bg-white/5 p-3 text-sm">
                  {threadErr}
                </div>
              ) : null}

              {composer}

              {focusedRootId ? (
                <div className="mt-3">
                  <button
                    type="button"
                    className="w-full rounded-md bg-white/5 px-2 py-1 text-xs text-left opacity-80 hover:bg-white/10 hover:opacity-100"
                    onClick={onClearRootFocus}
                  >
                    ← Back to all threads
                  </button>
                </div>
              ) : (
                <div className="mt-3 flex items-start justify-between gap-3">
                  <ExegesisIdentityPanel
                    show={showIdentityPanel}
                    canClaimName={canClaimName}
                    identityLabel={identityLabel}
                    publicName={viewerIdentity?.publicName}
                    isAdminAuthor={Boolean(viewerIdentity?.isAdmin)}
                    claimOpen={claimOpen}
                    claimName={claimName}
                    claimErr={claimErr}
                    claimBusy={claimBusy}
                    onToggleClaim={onToggleClaim}
                    onChangeClaimName={onChangeClaimName}
                    onCancelClaim={onCancelClaim}
                    onSubmitClaim={onSubmitClaim}
                  />

                  <div className="flex shrink-0 items-center justify-end gap-1.5">
                    <button
                      className={`rounded-md px-2 py-1 text-xs transition ${
                        sort === "top"
                          ? "bg-white/10 opacity-100"
                          : "bg-white/5 opacity-70 hover:opacity-100"
                      }`}
                      onClick={onSetSortTop}
                    >
                      Top
                    </button>
                    <button
                      className={`rounded-md px-2 py-1 text-xs transition ${
                        sort === "recent"
                          ? "bg-white/10 opacity-100"
                          : "bg-white/5 opacity-70 hover:opacity-100"
                      }`}
                      onClick={onSetSortRecent}
                    >
                      Recent
                    </button>
                  </div>
                </div>
              )}

              <div
                ref={threadScrollRef}
                className={`mt-3 space-y-3 flex-1 ${isMobile ? "afFadeScroll" : ""}`}
                style={{
                  overflowY: "auto",
                  overscrollBehavior: isMobile ? "contain" : "auto",
                  minHeight: 0,
                  paddingBottom: isMobile ? dockHeight : 0,
                }}
              >
                <div className="mt-3 space-y-3">
                  <ExegesisThreadList
                    roots={roots}
                    identities={identities}
                    focusedRootId={focusedRootId}
                    viewerMemberId={viewerMemberId}
                    viewerKind={viewerKind}
                    canPost={canPost}
                    canReport={canReport}
                    canVote={canVote}
                    isLocked={isLocked}
                    replyByCommentId={replyByCommentId}
                    editByCommentId={editByCommentId}
                    reportByCommentId={reportByCommentId}
                    replyMountKey={replyMountKey}
                    editMountKey={editMountKey}
                    previewMaxDepth={previewMaxDepth}
                    previewMaxComments={previewMaxComments}
                    rootElByIdRef={rootElByIdRef}
                    editWrapByIdRef={editWrapByIdRef}
                    replyWrapByIdRef={replyWrapByIdRef}
                    reportWrapByIdRef={reportWrapByIdRef}
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
                    onFocusRoot={onFocusRoot}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <ExegesisInlineGateOverlay
          open={inlineGate.open}
          message={inlineGate.message}
          dismissible={inlineGate.dismissible}
          onDismiss={onDismissInlineGate}
        />
      </div>
    </div>
  );
}
