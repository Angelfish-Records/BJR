"use client";

import React from "react";

type Ctx = {
  isMembershipOpen: boolean;
  openMembershipModal: () => void;
  closeMembershipModal: () => void;
};

const MembershipModalContext = React.createContext<Ctx | null>(null);

export function useMembershipModal(): Ctx {
  const ctx = React.useContext(MembershipModalContext);
  if (!ctx) {
    throw new Error("useMembershipModal must be used within MembershipModalProvider");
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
