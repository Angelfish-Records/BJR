import {defineField, defineType} from 'sanity'

export const moduleRichText = defineType({
  name: 'moduleRichText',
  title: 'Module: Rich text',
  type: 'object',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
    }),

    // Keep it simple: portable text for both teaser and full.
    defineField({
      name: 'full',
      title: 'Full',
      type: 'array',
      of: [{type: 'block'}],
      description: 'Only sent/rendered when entitled.',
    }),

    defineField({
      name: 'requiresEntitlement',
      title: 'Requires entitlement key',
      type: 'string',
      description: 'e.g. ENT.pageView("home") or ENTITLEMENTS.PATRON_ACCESS (string key)',
    }),
  ],
})
