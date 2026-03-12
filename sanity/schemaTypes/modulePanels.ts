// sanity/schemaTypes/modulePanels.ts
import { defineField, defineType } from "sanity";

export const modulePanels = defineType({
  name: "modulePanels",
  title: "Module: Panels",
  type: "object",
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
    }),

    defineField({
      name: "layout",
      title: "Layout",
      type: "number",
      initialValue: 2,
      options: {
        list: [
          { title: "One-across", value: 1 },
          { title: "Two-up", value: 2 },
          { title: "Three-up", value: 3 },
        ],
        layout: "radio",
      },
      validation: (r) => r.required().min(1).max(3),
    }),

    defineField({
      name: "panels",
      title: "Panels",
      type: "array",
      of: [
        defineField({
          name: "panel",
          title: "Panel",
          type: "object",
          fields: [
            defineField({
              name: "title",
              title: "Title",
              type: "string",
              validation: (r) => r.required(),
            }),

            defineField({
              name: "teaser",
              title: "Teaser (locked viewers)",
              type: "array",
              of: [{ type: "block" }],
              description:
                "Shown when viewer is not entitled (if gated). If empty, panel will not render for locked viewers.",
            }),

            defineField({
              name: "full",
              title: "Full (entitled viewers)",
              type: "array",
              of: [{ type: "block" }],
              description:
                "Shown when viewer is entitled (or always if not gated).",
              validation: (r) => r.required(),
            }),

            defineField({
              name: "requiresEntitlement",
              title: "Requires entitlement key",
              type: "string",
              description:
                "Optional entitlement required to reveal full content of this panel",
            }),

            defineField({
              name: "styleVariant",
              title: "Border style",
              type: "string",
              initialValue: "default",
              options: {
                list: [
                  { title: "Default", value: "default" },
                  { title: "Gold", value: "gold" },
                  { title: "PatternPill", value: "patternPill" },
                ],
              },
            }),
          ],
          preview: {
            select: {
              title: "title",
              requiresEntitlement: "requiresEntitlement",
            },
            prepare({ title, requiresEntitlement }) {
              return {
                title: title ?? "Panel",
                subtitle: requiresEntitlement ? "Gated" : "Ungated",
              };
            },
          },
        }),
      ],
      validation: (r) => r.required().min(1),
    }),
  ],

  preview: {
    select: { title: "title", panels: "panels", layout: "layout" },
    prepare({ title, panels, layout }) {
      const count = Array.isArray(panels) ? panels.length : 0;
      const cols =
        layout === 1
          ? "1-up"
          : layout === 2
            ? "2-up"
            : layout === 3
              ? "3-up"
              : "?";
      return {
        title: title ?? "Panels",
        subtitle: `${cols} · ${count} panel${count === 1 ? "" : "s"}`,
      };
    },
  },
});
