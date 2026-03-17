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
              name: "runtimePanelKind",
              title: "Runtime panel kind",
              type: "string",
              initialValue: "none",
              options: {
                list: [
                  { title: "Authored rich text panel", value: "none" },
                  { title: "Member summary panel", value: "memberSummary" },
                  {
                    title: "Feedback form: suggestion",
                    value: "feedbackSuggestion",
                  },
                  {
                    title: "Feedback form: bug report",
                    value: "feedbackBugReport",
                  },
                ],
              },
              description:
                "Use a runtime panel when this slot should render application data instead of authored Portable Text.",
            }),

            defineField({
              name: "runtimeDescription",
              title: "Runtime description override",
              type: "text",
              rows: 3,
              hidden: ({ parent }) =>
                parent?.runtimePanelKind !== "feedbackSuggestion" &&
                parent?.runtimePanelKind !== "feedbackBugReport",
              description:
                "Optional. Overrides the default descriptive copy for feedback runtime panels.",
            }),

            defineField({
              name: "runtimeSubmitLabel",
              title: "Runtime submit label override",
              type: "string",
              hidden: ({ parent }) =>
                parent?.runtimePanelKind !== "feedbackSuggestion" &&
                parent?.runtimePanelKind !== "feedbackBugReport",
              description:
                "Optional. Overrides the submit button label for feedback runtime panels.",
            }),

            defineField({
              name: "teaser",
              title: "Teaser (locked viewers)",
              type: "array",
              of: [{ type: "block" }],
              hidden: ({ parent }) => parent?.runtimePanelKind !== "none",
              description:
                "Shown when viewer is not entitled (if gated). If empty, panel will not render for locked viewers.",
            }),

            defineField({
              name: "full",
              title: "Full (entitled viewers)",
              type: "array",
              of: [{ type: "block" }],
              hidden: ({ parent }) => parent?.runtimePanelKind !== "none",
              description:
                "Shown when viewer is entitled (or always if not gated).",
              validation: (r) =>
                r.custom((value, context) => {
                  const parent =
                    context.parent &&
                    typeof context.parent === "object" &&
                    !Array.isArray(context.parent)
                      ? (context.parent as { runtimePanelKind?: string })
                      : null;

                  if (parent?.runtimePanelKind && parent.runtimePanelKind !== "none") {
                    return true;
                  }

                  return Array.isArray(value) && value.length > 0
                    ? true
                    : "Full content is required for authored rich text panels.";
                }),
            }),

            defineField({
              name: "requiresEntitlement",
              title: "Requires entitlement key",
              type: "string",
              description:
                "Optional entitlement required to reveal this panel.",
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
              runtimePanelKind: "runtimePanelKind",
            },
            prepare({ title, requiresEntitlement, runtimePanelKind }) {
              const kind =
                runtimePanelKind === "memberSummary"
                  ? "Runtime member panel"
                  : runtimePanelKind === "feedbackSuggestion"
                    ? "Runtime suggestion form"
                    : runtimePanelKind === "feedbackBugReport"
                      ? "Runtime bug report form"
                      : "Authored panel";

              const access = requiresEntitlement ? "Gated" : "Ungated";

              return {
                title: title ?? "Panel",
                subtitle: `${kind} · ${access}`,
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