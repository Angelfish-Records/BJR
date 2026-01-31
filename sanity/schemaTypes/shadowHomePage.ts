//web/sanity/schemaTypes/shadowHomePage.ts
import { defineField, defineType } from "sanity";

export const shadowHomePage = defineType({
  name: "shadowHomePage",
  title: "Brendan John Roch",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "subtitle",
      title: "Subtitle",
      type: "text",
      rows: 3,
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "title", maxLength: 96 },
      validation: (Rule) => Rule.required(),
    }),

    // ✅ NEW: Top logo image + display height
    defineField({
      name: "topLogo",
      title: "Top Logo",
      type: "image",
      options: { hotspot: true },
      description: "Logo shown in the portal top bar.",
    }),
    defineField({
      name: "topLogoHeight",
      title: "Top Logo Height (px)",
      type: "number",
      description:
        "Display height in pixels. Used only for rendering (no cropping).",
      initialValue: 38,
      validation: (Rule) =>
        Rule.min(16).max(120).integer().warning("Typical range is 24–64px."),
    }),

    defineField({
      name: "backgroundImage",
      title: "Background Image",
      type: "image",
      options: { hotspot: true },
    }),
    defineField({
      name: "primaryCtaText",
      title: "Primary CTA Text",
      type: "string",
    }),
    defineField({
      name: "primaryCtaHref",
      title: "Primary CTA Link",
      type: "url",
    }),
    defineField({
      name: "secondaryCtaText",
      title: "Secondary CTA Text",
      type: "string",
    }),
    defineField({
      name: "secondaryCtaHref",
      title: "Secondary CTA Link",
      type: "url",
    }),
    defineField({
      name: "sections",
      title: "Sections",
      type: "array",
      of: [
        {
          type: "object",
          name: "featureBlock",
          title: "Feature Block",
          fields: [
            defineField({ name: "heading", title: "Heading", type: "string" }),
            defineField({ name: "body", title: "Body", type: "text", rows: 4 }),
            defineField({
              name: "gatedHint",
              title: "Gated Hint (display only)",
              type: "string",
              description:
                "Optional label for editors. This does not enforce access; canonical checks remain server-side.",
            }),
          ],
          preview: {
            select: { title: "heading", subtitle: "gatedHint" },
          },
        },
      ],
    }),
  ],
});
