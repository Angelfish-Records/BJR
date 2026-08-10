// web/app/(site)/layout.tsx
import React from "react";
import SiteProviders from "./SiteProviders";

export default function SiteLayout(
  props: Readonly<{ children: React.ReactNode }>,
) {
  return <SiteProviders>{props.children}</SiteProviders>;
}
