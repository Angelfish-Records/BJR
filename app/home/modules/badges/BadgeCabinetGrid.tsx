// web/app/home/modules/badges/BadgeCabinetGrid.tsx
"use client";

import React from "react";

type Props = Readonly<{
  expanded: boolean;
  children: React.ReactNode;
}>;

export default function BadgeCabinetGrid(props: Props) {
  const { expanded, children } = props;

  return (
    <div
      className={`portal-member-badge-grid${
        expanded ? " portal-member-badges--expanded" : ""
      }`}
      data-expanded={expanded ? "true" : "false"}
    >
      {children}
    </div>
  );
}