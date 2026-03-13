// web/app/(site)/SiteProviders.tsx
"use client";

import React from "react";
import PlayerHost from "./PlayerHost";
import { MembershipModalProvider } from "@/app/home/MembershipModalProvider";
import { GateBrokerProvider } from "@/app/home/gating/GateBroker";
import AdminRibbonBootstrap from "@/app/home/AdminRibbonBootstrap";
import { BadgeAwardOverlayProvider } from "@/app/home/badges/BadgeAwardOverlayProvider";

export default function SiteProviders(props: { children: React.ReactNode }) {
  return (
    <GateBrokerProvider>
      <BadgeAwardOverlayProvider>
        <MembershipModalProvider>
          <PlayerHost>
            <AdminRibbonBootstrap />
            {props.children}
          </PlayerHost>
        </MembershipModalProvider>
      </BadgeAwardOverlayProvider>
    </GateBrokerProvider>
  );
}
