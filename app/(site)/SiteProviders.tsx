// web/app/(site)/SiteProviders.tsx
"use client";

import React from "react";
import PlayerHost from "./PlayerHost";
import AdminRibbon from "@/app/home/AdminRibbon";
import { MembershipModalProvider } from "@/app/home/MembershipModalProvider";
import { GateBrokerProvider } from "@/app/home/gating/GateBroker";

export default function SiteProviders(props: {
  children: React.ReactNode;
  isAdmin: boolean;
}) {
  return (
    <GateBrokerProvider>
      <MembershipModalProvider>
        <PlayerHost>
          {props.isAdmin ? <AdminRibbon isAdmin={props.isAdmin} /> : null}
          {props.children}
        </PlayerHost>
      </MembershipModalProvider>
    </GateBrokerProvider>
  );
}