// web/sanity.config.ts
"use client";

/**
 * Sanity Studio configuration (embedded in Next.js at /studio)
 */

import { defineConfig } from "sanity";
import { visionTool } from "@sanity/vision";
import { structureTool } from "sanity/structure";

import { schema } from "./sanity/schemaTypes";
import { structure } from "./sanity/structure";

// Singleton docs: visible in Structure, but should not be creatable as new documents globally.
const SINGLETON_TEMPLATE_IDS = new Set(["landingPage", "siteFlags"]);
// Your structure.ts pins these IDs explicitly via documentId(...)
const SINGLETON_SCHEMA_TYPES = new Set(["landingPage", "siteFlags"]);
const SINGLETON_DOCUMENT_IDS = new Set(["landingPage", "siteFlags"]);

function isSingleton(ctx: { schemaType?: string; documentId?: string }) {
  return (
    (ctx.schemaType ? SINGLETON_SCHEMA_TYPES.has(ctx.schemaType) : false) ||
    (ctx.documentId ? SINGLETON_DOCUMENT_IDS.has(ctx.documentId) : false)
  );
}

export default defineConfig({
  name: "default",
  title: "Sanity Studio",

  basePath: "/studio",

  projectId: "c16lgt95",
  dataset: "production",
  apiVersion: "2025-01-01",

  schema,

  document: {
    // Remove singleton templates from the global "New document" menu
    // so editors can't accidentally create duplicates.
    newDocumentOptions: (prev, context) => {
      if (context.creationContext.type === "global") {
        return prev.filter(
          (opt) => !SINGLETON_TEMPLATE_IDS.has(opt.templateId),
        );
      }
      return prev;
    },

    // Lock down singleton actions (no delete/duplicate).
    actions: (prev, context) => {
      if (isSingleton({ schemaType: context.schemaType, documentId: context.documentId })) {
        return prev.filter(
          (a) => a.action !== "delete" && a.action !== "duplicate",
        );
      }
      return prev;
    },
  },

  plugins: [
    structureTool({ structure }),
    visionTool({ defaultApiVersion: "2025-01-01" }),
  ],
});
