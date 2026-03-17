//web/app/home/MembershipModalProvider.tsx
"use client";

import React from "react";

type Ctx = {
  isMembershipOpen: boolean;
  openMembershipModal: () => void;
  closeMembershipModal: () => void;
};

const MembershipModalContext = React.createContext<Ctx | null>(null);

let warnedMissingProvider = false;

function getMembershipModalFallback(): Ctx {
  // Proxy makes this resilient even if Ctx gains new fields later.
  // - any function-like access becomes a no-op function
  // - common boolean-ish flags default to false
  return new Proxy(
    {},
    {
      get(_target, prop: string | symbol) {
        if (!warnedMissingProvider) {
          warnedMissingProvider = true;
          console.error(
            "useMembershipModal called without MembershipModalProvider in tree. Returning no-op fallback.",
          );
        }

        if (prop === "isMembershipOpen") return false;

        // default: return a callable no-op so open/close handlers don't explode
        return () => undefined;
      },
    },
  ) as unknown as Ctx;
}

export function useMembershipModal(): Ctx {
  const ctx = React.useContext(MembershipModalContext);

  if (!ctx) {
    // In dev, fail loudly so you fix the tree.
    if (process.env.NODE_ENV !== "production") {
      throw new Error(
        "useMembershipModal must be used within MembershipModalProvider",
      );
    }
    // In prod, never white-screen the app.
    return getMembershipModalFallback();
  }

  return ctx;
}

export function MembershipModalProvider(props: { children: React.ReactNode }) {
  const [isMembershipOpen, setOpen] = React.useState(false);

  const value = React.useMemo<Ctx>(
    () => ({
      isMembershipOpen,
      openMembershipModal: () => setOpen(true),
      closeMembershipModal: () => setOpen(false),
    }),
    [isMembershipOpen],
  );

  return (
    <MembershipModalContext.Provider value={value}>
      {props.children}
    </MembershipModalContext.Provider>
  );
}
