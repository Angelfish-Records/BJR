//web/sanity/schemaTypes/artistPost.ts
import { defineField, defineType } from "sanity";

export const artistPost = defineType({
  name: "artistPost",
  title: "Artist Post",
  type: "document",
  fields: [
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "title" },
      validation: (r) => r.required(),
    }),
    defineField({ name: "title", title: "Title (optional)", type: "string" }),
    defineField({
      name: "publishedAt",
      title: "Published at",
      type: "datetime",
      validation: (r) => r.required(),
    }),

    defineField({
      name: "postType",
      title: "Post type",
      type: "string",
      options: {
        list: [
          { title: "Creative", value: "creative" },
          { title: "Civic", value: "civic" },
          { title: "Cosmic", value: "cosmic" },
          { title: "Q&A", value: "qa" },
        ],
        layout: "radio",
      },
      initialValue: "standard",
      validation: (r) => r.required(),
    }),

    defineField({
      name: "body",
      title: "Body",
      type: "array",
      of: [
        { type: "block" },
        {
          type: "image",
          options: { hotspot: true },
          fields: [
            defineField({
              name: "maxWidth",
              title: "Max width (px)",
              type: "number",
              description:
                "Optional: cap the rendered inline image width (px). E.g. 320, 480, 640. Leave blank for auto sizing.",
              validation: (r) => r.min(160).max(1400).integer(),
            }),
          ],
        },
      ],
      validation: (r) => r.required().min(1),
    }),

    defineField({
      name: "images",
      title: "Images (optional)",
      type: "array",
      of: [
        {
          type: "image",
          options: { hotspot: true },
          fields: [
            defineField({
              name: "maxWidth",
              title: "Max width (px)",
              type: "number",
              description:
                "Optional: cap the rendered image width (px). Leave blank for auto sizing.",
              validation: (r) => r.min(160).max(1400).integer(),
            }),
          ],
        },
      ],
      description:
        "If you prefer images separate from body, use this. Otherwise embed images inside Body.",
    }),

    defineField({
      name: "visibility",
      title: "Visibility",
      type: "string",
      options: {
        list: [
          { title: "Public", value: "public" },
          { title: "Friends", value: "friend" },
          { title: "Patrons", value: "patron" },
          { title: "Partners", value: "partner" },
        ],
      },
      initialValue: "public",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "pinned",
      title: "Pinned",
      type: "boolean",
      initialValue: false,
    }),
  ],
  preview: {
    select: {
      title: "title",
      slug: "slug.current",
      publishedAt: "publishedAt",
    },
    prepare({ title, slug, publishedAt }) {
      return {
        title: title ?? slug ?? "Post",
        subtitle: publishedAt
          ? new Date(publishedAt).toLocaleString()
          : "Unpublished",
      };
    },
  },
});
