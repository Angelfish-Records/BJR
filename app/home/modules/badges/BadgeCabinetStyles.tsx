// web/app/home/modules/badges/BadgeCabinetStyles.tsx
"use client";

import React from "react";

export default function BadgeCabinetStyles() {
  return (
    <style jsx global>{`
      :global(:root) {
        --portal-badge-columns-collapsed: 8;
        --portal-badge-columns-expanded: 5;
        --portal-badge-gap-collapsed: 14px;
        --portal-badge-gap-expanded: 18px;
        --portal-badge-art-scale-collapsed: 0.82;
        --portal-badge-art-scale-expanded: 1;
        --portal-badge-caption-offset: -3px;
        --portal-badge-caption-row-gap-collapsed: 10px;
        --portal-badge-caption-row-gap-expanded: 16px;
      }

      @media (max-width: 640px) {
        :global(:root) {
          --portal-badge-gap-collapsed: 10px;
          --portal-badge-gap-expanded: 12px;
          --portal-badge-art-scale-collapsed: 0.84;
          --portal-badge-caption-row-gap-collapsed: 8px;
          --portal-badge-caption-row-gap-expanded: 12px;
        }
      }

      @media (max-width: 420px) {
        :global(:root) {
          --portal-badge-gap-collapsed: 8px;
          --portal-badge-gap-expanded: 10px;
          --portal-badge-art-scale-collapsed: 0.86;
          --portal-badge-caption-row-gap-collapsed: 6px;
          --portal-badge-caption-row-gap-expanded: 10px;
        }
      }

      .portal-member-badge-grid {
        display: grid;
        width: 100%;
        min-width: 0;
        grid-template-columns: repeat(
          var(--portal-badge-columns-collapsed),
          minmax(0, 1fr)
        );
        column-gap: var(--portal-badge-gap-collapsed);
        row-gap: var(--portal-badge-caption-row-gap-collapsed);
        align-items: start;
      }

      .portal-member-badge-grid.portal-member-badges--expanded {
        grid-template-columns: repeat(
          var(--portal-badge-columns-expanded),
          minmax(0, 1fr)
        );
        column-gap: var(--portal-badge-gap-expanded);
        row-gap: var(--portal-badge-caption-row-gap-expanded);
      }

      .portal-member-badge-shell {
        display: grid;
        justify-items: center;
        align-self: start;
        gap: 0;
        min-width: 0;
        width: 100%;
        transform: translate(0px, 0px);
      }

      .portal-member-badge-meta {
        width: 100%;
        max-width: 100%;
        display: grid;
        grid-template-rows: 0fr;
        margin-top: 0;
        opacity: 0;
        transform: translateY(-4px);
        pointer-events: none;
        transition:
          grid-template-rows 260ms cubic-bezier(0.22, 1, 0.36, 1),
          opacity 180ms ease,
          transform 220ms ease,
          margin-top 220ms ease;
        transition-delay: 0ms, 0ms, 0ms, 0ms;
        text-align: center;
      }

      .portal-member-badge-grid.portal-member-badges--expanded
        .portal-member-badge-meta {
        grid-template-rows: 1fr;
        margin-top: 10px;
        opacity: 1;
        transform: translateY(0);
        pointer-events: auto;
        transition-delay: 0ms, 110ms, 110ms, 0ms;
      }

      .portal-member-badge-meta-inner {
        overflow: hidden;
        min-height: 0;
        opacity: 0;
        transform: translateY(var(--portal-badge-caption-offset));
        transition:
          opacity 180ms ease,
          transform 220ms ease;
        transition-delay: 0ms, 0ms;
      }

      .portal-member-badge-grid.portal-member-badges--expanded
        .portal-member-badge-meta-inner {
        opacity: 1;
        transform: translateY(0);
        transition-delay: 140ms, 140ms;
      }

      .portal-member-badge-live-region {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }

      @media (prefers-reduced-motion: reduce) {
        .portal-member-badge-grid,
        .portal-member-badge-shell,
        .portal-member-badge-meta,
        .portal-member-badge-meta-inner {
          transition: none !important;
          transition-delay: 0ms !important;
        }

        .portal-member-badge-meta {
          grid-template-rows: none !important;
        }
      }
    `}</style>
  );
}