import {defineField, defineType} from 'sanity'

export const moduleHeading = defineType({
  name: 'moduleHeading',
  title: 'Module: Heading',
  type: 'object',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'blurb',
      title: 'Blurb',
      type: 'text',
      rows: 3,
    }),
  ],
  preview: {
    select: {title: 'title'},
    prepare({title}) {
      return {
        title,
        subtitle: 'Section heading',
      }
    },
  },
})
