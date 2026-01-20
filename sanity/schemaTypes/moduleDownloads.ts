// sanity/schemaTypes/moduleDownloads.ts
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

    // Optional: editors choose which asset buttons appear (and label overrides),
    // while code enforces that the assetId must exist in ALBUM_OFFERS[albumSlug].assets.
    defineField({
      name: 'assets',
      title: 'Assets to show (optional)',
      type: 'array',
      description:
        'If empty, the portal will show all assets defined in code for this album offer. If set, only these asset buttons will appear (in this order).',
      of: [
        {
          type: 'object',
          name: 'downloadAssetSelector',
          fields: [
            defineField({
              name: 'assetId',
              title: 'Asset ID',
              type: 'string',
              description:
                'Must match an asset.id in web/lib/albumOffers.ts for this album (e.g. "bundle_zip").',
              validation: (r) => r.required(),
            }),
            defineField({
              name: 'label',
              title: 'Button label override (optional)',
              type: 'string',
              description: 'If empty, uses the label from code.',
            }),
          ],
          preview: {
            select: {assetId: 'assetId', label: 'label'},
            prepare({assetId, label}) {
              return {
                title: label ? `${label}` : `${assetId}`,
                subtitle: label ? `assetId: ${assetId}` : 'download asset',
              }
            },
          },
        },
      ],
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
