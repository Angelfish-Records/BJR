import {defineField, defineType} from 'sanity'

export const portalPage = defineType({
  name: 'portalPage',
  title: 'Portal Page',
  type: 'document',
  fields: [
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {source: 'title'},
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
    }),
    defineField({
      name: 'modules',
      title: 'Modules',
      type: 'array',
      of: [{type: 'moduleRichText'}],
      validation: (r) => r.required().min(1),
    }),
  ],
})
