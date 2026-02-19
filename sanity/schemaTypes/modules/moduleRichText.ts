// sanity/schemaTypes/modules/moduleRichText.ts
import { defineField, defineType } from "sanity";

export const moduleRichText = defineType({
  name: "moduleRichText",
  title: "Module: Rich text",
  type: "object",
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
    }),

    // Shown when NOT entitled (optional if the module is not gated).
    defineField({
      name: "teaser",
      title: "Teaser",
      type: "array",
      of: [{ type: "block" }],
      description: "Shown when the viewer is not entitled (if gated).",
    }),

    // Shown when entitled (or always, if not gated).
    defineField({
      name: "full",
      title: "Full",
      type: "array",
      of: [{ type: "block" }],
      description:
        "Shown when the viewer is entitled (or always if not gated).",
      validation: (r) => r.required(),
    }),

    defineField({
      name: "requiresEntitlement",
      title: "Requires entitlement key",
      type: "string",
      description:
        'e.g. ENT.pageView("home") or ENTITLEMENTS.PATRON_ACCESS (string key)',
    }),
  ],
});
