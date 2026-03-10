// sanity/schemaTypes/landingPage.ts
import { defineField, defineType } from "sanity";

export const landingPage = defineType({
  name: "landingPage",
  title: "Landing Page",
  type: "document",
  fields: [
    defineField({
      name: "eyebrow",
      title: "Eyebrow",
      type: "string",
      description:
        "Small uppercase line above the logo or title, e.g. 'Independent platform in development'.",
    }),
    defineField({
      name: "title",
      title: "Fallback Title",
      type: "string",
      description:
        "Used only if no logo image is supplied. Keep short.",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "logoImage",
      title: "Logo Image",
      type: "image",
      description:
        "Transparent PNG, WebP, or SVG-like raster export preferred. This replaces the large text heading on the landing page.",
      options: { hotspot: true },
    }),
    defineField({
      name: "logoAlt",
      title: "Logo Alt Text",
      type: "string",
      description: "Accessible description for the landing-page logo image.",
      initialValue: "Site logo",
    }),
    defineField({
      name: "backgroundImage",
      title: "Background Image",
      type: "image",
      options: { hotspot: true },
    }),
    defineField({
      name: "subtitle",
      title: "Subtitle",
      type: "text",
      rows: 4,
    }),
    defineField({
      name: "ctaText",
      title: "CTA Text",
      type: "string",
      description: "Text for the outbound secondary button.",
    }),
    defineField({
      name: "ctaHref",
      title: "CTA Link",
      type: "url",
      description: "Outbound link for the secondary button.",
    }),
  ],
  preview: {
    select: {
      title: "title",
      media: "logoImage",
      subtitle: "subtitle",
    },
    prepare(selection) {
      const title = selection.title || "Landing Page";
      const subtitle =
        typeof selection.subtitle === "string" && selection.subtitle.trim().length > 0
          ? selection.subtitle
          : "No subtitle set";

      return {
        title,
        subtitle,
        media: selection.media,
      };
    },
  },
});