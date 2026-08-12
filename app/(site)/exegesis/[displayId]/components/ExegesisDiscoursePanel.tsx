// web/app/(site)/exegesis/[displayId]/components/ExegesisDiscoursePanel.tsx
"use client";

import React from "react";
import ExegesisDiscourseShimmer from "./ExegesisDiscourseShimmer";
import ExegesisIdentityPanel from "./ExegesisIdentityPanel";
import ExegesisInlineGateOverlay from "./ExegesisInlineGateOverlay";
import ExegesisThreadList from "./ExegesisThreadList";
import type {
  CommentDTO,
  EditDraft,
  LyricsApiOk,
  ReplyDraft,
  ReportDraft,
  ThreadApiOk,
} from "../exegesisTypes";
import { cueCanonicalGroupKey, isSameGroup } from "../exegesisUi";
import type { ResolvedDisplayIdentity } from "@/lib/memberIdentity";

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

type ExegesisDiscoursePanelProps = Readonly<{
  isMobile: boolean;
  desktopPanelH: number;
  dockHeight: number;
  lyrics: LyricsApiOk;
  selected: SelectedLine | null;
  shouldShowInitialShimmer: boolean;
  isLocked: boolean;
  showIdentityPanel: boolean;
  viewerAuthorIdentity: ResolvedDisplayIdentity | null;
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
  onChangeEditDraft: (commentId: string, patch: Partial<EditDraft>) => void;
  onChangeReplyDraft: (commentId: string, patch: Partial<ReplyDraft>) => void;
  onChangeReportDraft: (commentId: string, next: ReportDraft) => void;
  onFocusRoot: (rootId: string) => void;
  onDismissInlineGate: () => void;
}>;

function getPanelStyle(
  isMobile: boolean,
  desktopPanelH: number,
): React.CSSProperties | undefined {
  if (isMobile || !desktopPanelH) return undefined;
  return { maxHeight: desktopPanelH };
}

function SelectedLineExcerpt(
  props: Readonly<{
    lyrics: LyricsApiOk;
    selected: SelectedLine;
  }>,
) {
  const { lyrics, selected } = props;
  const groupKey = (selected.groupKey ?? "").trim();

  const selectedLineStyle: React.CSSProperties = {
    fontSize: 18,
    lineHeight: 1.35,
    fontWeight: 700,
    color: "rgba(255,255,255,0.96)",
    letterSpacing: "-0.01em",
  };

  if (!groupKey) {
    return <div style={selectedLineStyle}>{selected.lineText}</div>;
  }

  const groupCues = (lyrics.cues ?? []).filter((cue) =>
    isSameGroup(cueCanonicalGroupKey(lyrics, cue), groupKey),
  );

  const lines =
    groupCues.length > 0
      ? groupCues
      : [{ lineKey: selected.lineKey, text: selected.lineText }];

  return (
    <div style={{ display: "grid", gap: 5 }}>
      {lines.map((cue) => (
        <div key={cue.lineKey} style={selectedLineStyle}>
          {cue.text}
        </div>
      ))}
    </div>
  );
}

type PanelControlsProps = Readonly<
  Pick<
    ExegesisDiscoursePanelProps,
    | "focusedRootId"
    | "showIdentityPanel"
    | "viewerAuthorIdentity"
    | "claimOpen"
    | "claimName"
    | "claimErr"
    | "claimBusy"
    | "sort"
    | "onClearRootFocus"
    | "onSetSortTop"
    | "onSetSortRecent"
    | "onToggleClaim"
    | "onChangeClaimName"
    | "onCancelClaim"
    | "onSubmitClaim"
  >
>;

function PanelControls(props: PanelControlsProps) {
  const {
    focusedRootId,
    showIdentityPanel,
    viewerAuthorIdentity,
    claimOpen,
    claimName,
    claimErr,
    claimBusy,
    sort,
    onClearRootFocus,
    onSetSortTop,
    onSetSortRecent,
    onToggleClaim,
    onChangeClaimName,
    onCancelClaim,
    onSubmitClaim,
  } = props;

  if (focusedRootId) {
    return (
      <div className="mt-3">
        <button
          type="button"
          className="w-full rounded-md bg-white/5 px-2 py-1 text-xs text-left opacity-80 hover:bg-white/10 hover:opacity-100"
          onClick={onClearRootFocus}
        >
          ← Back to all threads
        </button>
      </div>
    );
  }

  const topClassName =
    sort === "top"
      ? "bg-white/10 opacity-100"
      : "bg-white/5 opacity-70 hover:opacity-100";
  const recentClassName =
    sort === "recent"
      ? "bg-white/10 opacity-100"
      : "bg-white/5 opacity-70 hover:opacity-100";

  return (
    <div className="mt-3 flex items-start justify-between gap-3">
      <ExegesisIdentityPanel
        show={showIdentityPanel}
        authorLabel={viewerAuthorIdentity?.displayName ?? ""}
        hasClaimedPublicName={
          viewerAuthorIdentity?.hasClaimedPublicName ?? false
        }
        canClaimName={viewerAuthorIdentity?.canClaimName ?? false}
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
          type="button"
          className={`rounded-md px-2 py-1 text-xs transition ${topClassName}`}
          onClick={onSetSortTop}
        >
          Top
        </button>
        <button
          type="button"
          className={`rounded-md px-2 py-1 text-xs transition ${recentClassName}`}
          onClick={onSetSortRecent}
        >
          Recent
        </button>
      </div>
    </div>
  );
}

type LoadedDiscourseProps = Readonly<
  Pick<
    ExegesisDiscoursePanelProps,
    | "isMobile"
    | "dockHeight"
    | "lyrics"
    | "isLocked"
    | "showIdentityPanel"
    | "viewerAuthorIdentity"
    | "claimOpen"
    | "claimName"
    | "claimErr"
    | "claimBusy"
    | "threadErr"
    | "composer"
    | "focusedRootId"
    | "sort"
    | "threadScrollRef"
    | "roots"
    | "identities"
    | "viewerMemberId"
    | "viewerKind"
    | "canPost"
    | "canReport"
    | "canVote"
    | "replyByCommentId"
    | "editByCommentId"
    | "reportByCommentId"
    | "replyMountKey"
    | "editMountKey"
    | "previewMaxDepth"
    | "previewMaxComments"
    | "rootElByIdRef"
    | "editWrapByIdRef"
    | "replyWrapByIdRef"
    | "reportWrapByIdRef"
    | "onClearRootFocus"
    | "onSetSortTop"
    | "onSetSortRecent"
    | "onToggleClaim"
    | "onChangeClaimName"
    | "onCancelClaim"
    | "onSubmitClaim"
    | "onOpenReply"
    | "onOpenReport"
    | "onToggleVote"
    | "onOpenEdit"
    | "onSubmitEdit"
    | "onSubmitReply"
    | "onSubmitReport"
    | "onChangeEditDraft"
    | "onChangeReplyDraft"
    | "onChangeReportDraft"
    | "onFocusRoot"
  > & {
    selected: SelectedLine;
  }
>;

function LoadedDiscourse(props: LoadedDiscourseProps) {
  const {
    isMobile,
    dockHeight,
    lyrics,
    selected,
    isLocked,
    showIdentityPanel,
    viewerAuthorIdentity,
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
  } = props;

  return (
    <>
      {isLocked ? (
        <div className="mt-2 rounded-md bg-white/5 p-3 text-sm">
          <div className="opacity-80">This thread is locked.</div>
          <div className="mt-1 text-xs opacity-60">
            You can still read, but posting is disabled.
          </div>
        </div>
      ) : null}

      <div className="mt-2 border-l-2 border-[var(--lxSelected)] bg-black/20 pl-3 text-sm">
        <SelectedLineExcerpt lyrics={lyrics} selected={selected} />
      </div>

      {threadErr ? (
        <div className="mt-3 rounded-md bg-white/5 p-3 text-sm">
          {threadErr}
        </div>
      ) : null}

      {composer}

      <PanelControls
        focusedRootId={focusedRootId}
        showIdentityPanel={showIdentityPanel}
        viewerAuthorIdentity={viewerAuthorIdentity}
        claimOpen={claimOpen}
        claimName={claimName}
        claimErr={claimErr}
        claimBusy={claimBusy}
        sort={sort}
        onClearRootFocus={onClearRootFocus}
        onSetSortTop={onSetSortTop}
        onSetSortRecent={onSetSortRecent}
        onToggleClaim={onToggleClaim}
        onChangeClaimName={onChangeClaimName}
        onCancelClaim={onCancelClaim}
        onSubmitClaim={onSubmitClaim}
      />

      <div
        ref={threadScrollRef}
        className={`mt-3 space-y-3 flex-1 ${isMobile ? "afFadeScroll" : ""}`}
        style={{
          overflowY: "auto",
          overflowX: "hidden",
          overscrollBehavior: isMobile ? "contain" : "auto",
          minHeight: 0,
          paddingBottom: isMobile ? dockHeight : 0,
        }}
      >
        <div
          className={`mt-3 space-y-3 ${
            focusedRootId
              ? "afThreadViewEnterForward"
              : "afThreadViewEnterBack"
          }`}
        >
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
  );
}

export default function ExegesisDiscoursePanel(
  props: ExegesisDiscoursePanelProps,
) {
  const {
    isMobile,
    desktopPanelH,
    dockHeight,
    lyrics,
    selected,
    shouldShowInitialShimmer,
    isLocked,
    showIdentityPanel,
    viewerAuthorIdentity,
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

  const panelStyle = getPanelStyle(isMobile, desktopPanelH);
  const contentClassName = inlineGate.open
    ? "min-h-0 flex-1 flex flex-col blur-[1.5px] opacity-55 pointer-events-none select-none"
    : "min-h-0 flex-1 flex flex-col";

  let content: React.ReactNode;

  if (!selected) {
    content = (
      <div className="rounded-xl bg-white/5 p-4">
        <div className="text-sm opacity-70">
          Select a line to view the discussion.
        </div>
      </div>
    );
  } else if (shouldShowInitialShimmer) {
    content = <ExegesisDiscourseShimmer />;
  } else {
    content = (
      <LoadedDiscourse
        isMobile={isMobile}
        dockHeight={dockHeight}
        lyrics={lyrics}
        selected={selected}
        isLocked={isLocked}
        showIdentityPanel={showIdentityPanel}
        viewerAuthorIdentity={viewerAuthorIdentity}
        claimOpen={claimOpen}
        claimName={claimName}
        claimErr={claimErr}
        claimBusy={claimBusy}
        threadErr={threadErr}
        composer={composer}
        focusedRootId={focusedRootId}
        sort={sort}
        threadScrollRef={threadScrollRef}
        roots={roots}
        identities={identities}
        viewerMemberId={viewerMemberId}
        viewerKind={viewerKind}
        canPost={canPost}
        canReport={canReport}
        canVote={canVote}
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
        onClearRootFocus={onClearRootFocus}
        onSetSortTop={onSetSortTop}
        onSetSortRecent={onSetSortRecent}
        onToggleClaim={onToggleClaim}
        onChangeClaimName={onChangeClaimName}
        onCancelClaim={onCancelClaim}
        onSubmitClaim={onSubmitClaim}
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
    );
  }

  return (
    <div
      className={
        isMobile
          ? "h-full bg-black p-4 flex flex-col"
          : "rounded-xl bg-white/5 p-4 flex flex-col"
      }
      style={panelStyle}
    >
      <div className="relative min-h-0 flex-1 flex flex-col">
        <div className={contentClassName}>{content}</div>

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
