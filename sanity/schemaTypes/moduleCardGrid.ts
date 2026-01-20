// sanity/schemaTypes/moduleCardGrid.ts
import {defineField, defineType} from 'sanity'

export const moduleCardGrid = defineType({
  name: 'moduleCardGrid',
  title: 'Module: Card Grid',
  type: 'object',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
    }),
    defineField({
      name: 'cards',
      title: 'Cards',
      type: 'array',
      of: [
        defineField({
          name: 'card',
          title: 'Card',
          type: 'object',
          fields: [
            defineField({
              name: 'title',
              title: 'Title',
              type: 'string',
              validation: (r) => r.required(),
            }),
            defineField({
              name: 'body',
              title: 'Body',
              type: 'text',
              rows: 3,
            }),
            defineField({
              name: 'requiresEntitlement',
              title: 'Requires entitlement key',
              type: 'string',
              description: 'Optional entitlement required to reveal this card',
            }),
          ],
          preview: {
            select: {title: 'title'},
            prepare({title}) {
              return {title: title ?? 'Card'}
            },
          },
        }),
      ],
      validation: (r) => r.required().min(1),
    }),
  ],
  preview: {
    select: {title: 'title', cards: 'cards'},
    prepare({title, cards}) {
      const count = Array.isArray(cards) ? cards.length : 0
      return {
        title: title ?? 'Card grid',
        subtitle: `${count} card${count === 1 ? '' : 's'}`,
      }
    },
  },
})
