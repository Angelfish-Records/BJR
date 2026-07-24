import { defineField, defineType } from "sanity";

export const siteFlags = defineType({
  name: "siteFlags",
  title: "Site Configuration",
  type: "document",
  fields: [
    defineField({
      name: "featuredAlbum",
      title: "Default album",
      type: "reference",
      to: [{ type: "album" }],
      description:
        "Album opened when a visitor enters through the root domain or /player.",
    }),
    defineField({
      name: "featuredAlbumFallbackSlug",
      title: "Default album fallback slug",
      type: "string",
      description:
        "Used only when the Default album reference is missing or broken.",
      validation: (rule) =>
        rule
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          .warning("Use a slug-like value such as god-defend"),
    }),
  ],
});