import {defineField, defineType} from 'sanity'

export const moduleDownloads = defineType({
  name: 'moduleDownloads',
  title: 'Module: Downloads',
  type: 'object',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
    }),
    defineField({
      name: 'albumSlug',
      title: 'Album slug',
      type: 'string',
      description: 'Must match AlbumOffer.albumSlug',
      validation: (r) => r.required(),
    }),
    defineField({
      name: 'teaserCopy',
      title: 'Teaser copy',
      type: 'text',
      rows: 3,
      description: 'Shown when user does not own the album',
    }),
  ],
  preview: {
    select: {title: 'title', albumSlug: 'albumSlug'},
    prepare({title, albumSlug}) {
      return {
        title: title ?? `Downloads: ${albumSlug}`,
        subtitle: 'Album downloads (entitlement-gated)',
      }
    },
  },
})
