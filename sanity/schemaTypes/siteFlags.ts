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
  ],
});
