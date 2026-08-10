//web/app/home/StableSessionShell.tsx
"use client";

import React from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import PortalArea, { type PortalAreaProps } from "@/app/home/PortalArea";
import {
  SessionRuntimePayloadProvider,
  useSessionRuntimePayloadRecord,
} from "@/app/home/SessionRuntimePayloadContext";
import type { SessionRuntimePayload } from "@/app/home/sessionRuntimePayload";

type ShellConfig = {
  topLogoUrl: string | null;
  topLogoHeight: number | null;
  featuredAlbumSlug: string;
  albums: PortalAreaProps["albums"];
  portalModules: PortalAreaProps["portalModules"];
};

function toPortalAreaProps(
  payload: SessionRuntimePayload,
  shell: ShellConfig,
): PortalAreaProps {
  return {
    portalModules: shell.portalModules,
    memberId: payload.memberId,
    entitlementKeys: payload.entitlementKeys,
    memberSummary: payload.memberSummary,

    topLogoUrl: shell.topLogoUrl,
    topLogoHeight: shell.topLogoHeight,

    initialPortalTabId: payload.initialPortalTabId,
    initialExegesisDisplayId: payload.initialExegesisDisplayId,

    bundle: payload.bundle,
    albums: shell.albums,
    featuredAlbumSlug: shell.featuredAlbumSlug,

    tier: payload.tier,
    canManageBilling: payload.canManageBilling,
  };
}

function StableSessionViewport(
  props: Readonly<{
    runtime: React.ReactNode;
    shell: ShellConfig;
  }>,
) {
  const record = useSessionRuntimePayloadRecord();
  const payload = record?.payload ?? null;
  const router = useRouter();

  const { isLoaded: clerkAuthLoaded, isSignedIn, userId } = useAuth();

  const runtimeAuthKey = !clerkAuthLoaded
    ? null
    : isSignedIn === true
      ? userId
        ? `member:${userId}`
        : null
      : "anonymous";

  const previousRuntimeAuthKeyRef = React.useRef<string | null>(null);
  const awaitingMemberRuntimeKeyRef = React.useRef<string | null>(null);
  const payloadAtAuthRefreshRef = React.useRef<SessionRuntimePayload | null>(
    null,
  );

  React.useEffect(() => {
    if (!runtimeAuthKey) return;

    const previousRuntimeAuthKey = previousRuntimeAuthKeyRef.current;
    previousRuntimeAuthKeyRef.current = runtimeAuthKey;

    if (
      previousRuntimeAuthKey === null ||
      previousRuntimeAuthKey === runtimeAuthKey
    ) {
      return;
    }

    if (runtimeAuthKey === "anonymous") {
      awaitingMemberRuntimeKeyRef.current = null;
      payloadAtAuthRefreshRef.current = null;
      router.refresh();
      return;
    }

    // The OTP component performs an eager refresh as soon as Clerk activates
    // the session. This identity-driven refresh is the authoritative follow-up:
    // it runs only once Clerk itself reports the new user/session as active.
    awaitingMemberRuntimeKeyRef.current = runtimeAuthKey;
    payloadAtAuthRefreshRef.current = payload;
    router.refresh();
  }, [payload, router, runtimeAuthKey]);

  React.useEffect(() => {
    const awaitingRuntimeKey = awaitingMemberRuntimeKeyRef.current;

    if (!awaitingRuntimeKey || runtimeAuthKey !== awaitingRuntimeKey) {
      return;
    }

    // Wait for the refreshed server payload rather than treating the old
    // anonymous payload as member-ready.
    if (payload === payloadAtAuthRefreshRef.current) {
      return;
    }

    if (!payload?.memberId) {
      return;
    }

    awaitingMemberRuntimeKeyRef.current = null;
    payloadAtAuthRefreshRef.current = null;

    window.dispatchEvent(
      new CustomEvent("af:session-runtime-member-ready", {
        detail: {
          memberId: payload.memberId,
        },
      }),
    );
  }, [payload, runtimeAuthKey]);

  const portalAreaProps = React.useMemo(() => {
    if (!payload) return null;
    return toPortalAreaProps(payload, props.shell);
  }, [payload, props.shell]);

  return (
    <>
      {/* Runtime payload bridge subtree */}
      <div aria-hidden="true" hidden>
        {props.runtime}
      </div>

      {/* Persistent UI shell */}
      {portalAreaProps ? <PortalArea {...portalAreaProps} /> : null}
    </>
  );
}

export default function StableSessionShell(
  props: Readonly<{
    runtime: React.ReactNode;
    topLogoUrl: string | null;
    topLogoHeight: number | null;
    featuredAlbumSlug: string;
    albums: PortalAreaProps["albums"];
    portalModules: PortalAreaProps["portalModules"];
  }>,
) {
  const shell: ShellConfig = {
    topLogoUrl: props.topLogoUrl,
    topLogoHeight: props.topLogoHeight,
    featuredAlbumSlug: props.featuredAlbumSlug,
    albums: props.albums,
    portalModules: props.portalModules,
  };

  return (
    <SessionRuntimePayloadProvider>
      <StableSessionViewport runtime={props.runtime} shell={shell} />
    </SessionRuntimePayloadProvider>
  );
}
