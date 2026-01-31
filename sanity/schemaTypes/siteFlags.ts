import { defineField, defineType } from "sanity";

export const siteFlags = defineType({
  name: "siteFlags",
  title: "Site Flags",
  type: "document",
  fields: [
    defineField({
      name: "shadowHomeEnabled",
      title: "Shadow Home Enabled",
      type: "boolean",
      initialValue: true,
      description:
        "If false, the shadow homepage is considered paused/disabled by the app layer.",
    }),
    defineField({
      name: "shadowHomeRoute",
      title: "Shadow Home Route",
      type: "string",
      initialValue: "/home",
      description:
        'Where the shadow homepage lives today. Later you can swap this to "/".',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "featuredAlbum",
      title: "Featured album",
      type: "reference",
      to: [{type: "album"}],
      description:
        "Default album shown on /home when no ?album= is provided. Use an album reference (not a slug string).",
    }),

    // Optional: a safe fallback that keeps prod alive if the reference is unset/broken.
    defineField({
      name: "featuredAlbumFallbackSlug",
      title: "Featured album fallback slug",
      type: "string",
      description:
        "Only used if Featured album reference is missing. Example: consolers",
      validation: (r) => r.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).warning("Use a slug-like value"),
    }),
  ],
});
