// sanity/schemaTypes/album.ts
import {defineType, defineField} from 'sanity'

const THEME_OPTIONS = [
  {title: 'Nebula', value: 'nebula'},
  {title: 'Gravitational Lattice', value: 'gravitational-lattice'},
  {title: 'Orbital Script', value: 'orbital-script'},
  {title: 'Phase Glass', value: 'phase-glass'},
]

export default defineType({
  name: 'album',
  title: 'Album',
  type: 'document',
  fields: [
    defineField({
      name: 'catalogId',
      title: 'Catalogue ID',
      type: 'string',
      description:
        'Stable canonical ID for this album (label catalogue). Used for entitlements, URLs, and future variants. Example: AF-ALB-0001',
      validation: (r) =>
        r
          .required()
          .min(3)
          .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{2,}$/)
          .warning('Use a stable ID: letters/numbers plus . _ : -'),
    }),

    defineField({
      name: 'title',
      type: 'string',
      validation: (r) => r.required(),
    }),
    defineField({name: 'artist', type: 'string'}),
    defineField({name: 'year', type: 'number'}),

    defineField({
      name: 'slug',
      type: 'slug',
      options: {source: 'title'},
      validation: (r) => r.required(),
    }),

    defineField({
      name: 'artwork',
      type: 'image',
      options: {hotspot: true},
    }),

    defineField({name: 'description', type: 'text'}),

    // ✅ Album default theme (track can override)
    defineField({
      name: 'visualTheme',
      title: 'Visualizer Theme (Default)',
      type: 'string',
      description: 'Default visualizer theme for tracks on this album (tracks can override).',
      options: {
        list: THEME_OPTIONS,
        layout: 'radio',
      },
      initialValue: 'nebula',
    }),

    defineField({
      name: 'tracks',
      title: 'Tracks',
      type: 'array',
      of: [
        {
          type: 'object',
          name: 'albumTrack',
          title: 'Track',
          fields: [
            defineField({
              name: 'catalogId',
              title: 'Track Catalogue ID',
              type: 'string',
              description:
                'Stable canonical ID for this track (label catalogue). Example: AF-TRK-0001-A (use suffixes for variants).',
              validation: (r) =>
                r
                  .required()
                  .min(3)
                  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{2,}$/)
                  .warning('Use a stable ID: letters/numbers plus . _ : -'),
            }),

            defineField({
              name: 'id',
              title: 'Legacy Track ID',
              type: 'string',
              description:
                'Deprecated. Kept for backwards compatibility with existing lyrics + playback wiring. Prefer Track Catalogue ID.',
              validation: (r) => r.required(),
            }),

            defineField({
              name: 'title',
              type: 'string',
              validation: (r) => r.required(),
            }),
            defineField({name: 'artist', type: 'string'}),
            defineField({name: 'durationMs', type: 'number'}),

            defineField({
              name: 'muxPlaybackId',
              type: 'string',
              description: 'Mux playback ID for HLS streaming.',
              validation: (r) => r.required(),
            }),

            // ✅ Track override theme
            defineField({
              name: 'visualTheme',
              title: 'Visualizer Theme (Override)',
              type: 'string',
              description: 'Optional override for this track. If empty, album default is used.',
              options: {
                list: [{title: 'Use album default', value: ''}, ...THEME_OPTIONS],
              },
            }),
          ],
          preview: {
            select: {title: 'title', subtitle: 'muxPlaybackId', theme: 'visualTheme', cat: 'catalogId'},
            prepare({
              title,
              subtitle,
              theme,
              cat,
            }: {
              title?: string
              subtitle?: string
              theme?: string
              cat?: string
            }) {
              const t = typeof theme === 'string' && theme.trim().length ? theme.trim() : 'album default'
              const cid = typeof cat === 'string' && cat.trim().length ? cat.trim() : 'no catalogId'
              return {title, subtitle: `${subtitle ?? ''}${subtitle ? ' · ' : ''}${t} · ${cid}`}
            },
          },
        },
      ],
      validation: (r) => r.min(1),
    }),
  ],
  preview: {
    select: {title: 'title', cat: 'catalogId', artist: 'artist', year: 'year'},
    prepare({title, cat, artist, year}: {title?: string; cat?: string; artist?: string; year?: number}) {
      const bits = [artist, typeof year === 'number' ? String(year) : undefined, cat].filter(Boolean)
      return {title: title ?? 'Untitled', subtitle: bits.join(' · ')}
    },
  },
})
