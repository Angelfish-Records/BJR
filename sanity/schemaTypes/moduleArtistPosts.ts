// sanity/schemaTypes/moduleArtistPosts.ts
import { defineField, defineType } from "sanity";

export const moduleArtistPosts = defineType({
  name: "moduleArtistPosts",
  title: "Module: Artist Posts",
  type: "object",
  fields: [
    defineField({ name: "title", title: "Title", type: "string" }),
    defineField({
      name: "pageSize",
      title: "Posts per page",
      type: "number",
      initialValue: 10,
      validation: (r) => r.required().min(3).max(30),
    }),
    defineField({
      name: "requireAuthAfter",
      title: "Require auth after N posts (anon session)",
      type: "number",
      initialValue: 3,
      validation: (r) => r.required().min(1).max(20),
    }),
    defineField({
      name: "minVisibility",
      title: "Minimum visibility to show",
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
  ],
  preview: {
    select: { title: "title" },
    prepare({ title }) {
      return {
        title: title ?? "Artist posts",
        subtitle: "Feed (shareable, session-gated)",
      };
    },
  },
});
