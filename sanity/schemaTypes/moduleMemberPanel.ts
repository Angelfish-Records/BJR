import { defineField, defineType } from "sanity";

export const moduleMemberPanel = defineType({
  name: "moduleMemberPanel",
  title: "Module: Member Panel",
  type: "object",
  fields: [
    defineField({
      name: "title",
      title: "Title override",
      type: "string",
      description:
        "Optional. Runtime data still controls the panel itself; this only overrides the panel heading.",
    }),
  ],
  preview: {
    select: {
      title: "title",
    },
    prepare(selection) {
      const title =
        typeof selection.title === "string" && selection.title.trim()
          ? selection.title.trim()
          : "Member Panel";

      return {
        title,
        subtitle: "Runtime member dashboard marker",
      };
    },
  },
});