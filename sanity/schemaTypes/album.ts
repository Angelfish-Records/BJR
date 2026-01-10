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
              name: 'id',
              type: 'string',
              description: 'Stable track id (your canonical id).',
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
            select: {title: 'title', subtitle: 'muxPlaybackId', theme: 'visualTheme'},
            prepare({title, subtitle, theme}: {title?: string; subtitle?: string; theme?: string}) {
              const t = typeof theme === 'string' && theme.trim().length ? theme.trim() : 'album default'
              return {title, subtitle: `${subtitle ?? ''}${subtitle ? ' · ' : ''}${t}`}
            },
          },
        },
      ],
      validation: (r) => r.min(1),
    }),
  ],
})
