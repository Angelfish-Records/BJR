// sanity/schemaTypes/badgeDefinition.ts
import { defineField, defineType } from "sanity";

export const badgeDefinition = defineType({
  name: "badgeDefinition",
  title: "Badge Definition",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      validation: (rule) => rule.required().min(1),
    }),
    defineField({
      name: "entitlementKey",
      title: "Entitlement key",
      type: "string",
      description:
        "Exact entitlement key used in Postgres, for example badge_early_supporter.",
      validation: (rule) =>
        rule
          .required()
          .regex(/^badge_[a-z0-9]+(?:_[a-z0-9]+)*$/, {
            name: "badge entitlement key",
            invert: false,
          })
          .error(
            "Badge keys must start with badge_ and use lowercase letters, numbers, and underscores only.",
          ),
    }),
    defineField({
      name: "description",
      title: "Description",
      type: "text",
      rows: 3,
    }),
    defineField({
      name: "image",
      title: "Image",
      type: "image",
      options: {
        hotspot: true,
      },
    }),
    defineField({
      name: "displayOrder",
      title: "Display order",
      type: "number",
      initialValue: 100,
      validation: (rule) => rule.integer().min(0),
    }),
    defineField({
      name: "featured",
      title: "Featured",
      type: "boolean",
      initialValue: false,
    }),
    defineField({
      name: "shareable",
      title: "Shareable",
      type: "boolean",
      initialValue: false,
    }),
    defineField({
      name: "undisclosed",
      title: "Undisclosed until unlocked",
      type: "boolean",
      initialValue: false,
      description:
        "Hide this badge from members who have not unlocked it yet. Useful for exclusive, retired, or time-bound badges that should not appear as visible locked promises.",
    }),
    defineField({
      name: "active",
      title: "Active",
      type: "boolean",
      initialValue: true,
    }),
    defineField({
      name: "internalNote",
      title: "Internal note",
      type: "text",
      rows: 4,
    }),
  ],
  orderings: [
    {
      title: "Display order",
      name: "displayOrderAsc",
      by: [
        { field: "displayOrder", direction: "asc" },
        { field: "title", direction: "asc" },
      ],
    },
  ],
  preview: {
    select: {
      title: "title",
      entitlementKey: "entitlementKey",
      media: "image",
      active: "active",
      undisclosed: "undisclosed",
    },
    prepare(selection) {
      const title =
        typeof selection.title === "string" && selection.title.trim()
          ? selection.title.trim()
          : "Untitled badge";

      const entitlementKey =
        typeof selection.entitlementKey === "string" &&
        selection.entitlementKey.trim()
          ? selection.entitlementKey.trim()
          : "No entitlement key";

      const stateBits = [
        selection.active === false ? "inactive" : null,
        selection.undisclosed === true ? "undisclosed" : null,
      ].filter((value): value is string => Boolean(value));

      return {
        title,
        subtitle:
          stateBits.length > 0
            ? `${entitlementKey} · ${stateBits.join(" · ")}`
            : entitlementKey,
        media: selection.media,
      };
    },
  },
});
