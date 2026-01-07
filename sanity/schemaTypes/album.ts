import {defineType, defineField} from 'sanity'

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
          ],
          preview: {
            select: {title: 'title', subtitle: 'muxPlaybackId'},
          },
        },
      ],
      validation: (r) => r.min(1),
    }),
  ],
})
