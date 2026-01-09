// sanity/schemaTypes/lyrics.ts
import {defineField, defineType} from 'sanity'
import CuesImportInput from '../components/CuesImportInput'

export default defineType({
  name: 'lyrics',
  title: 'Lyrics',
  type: 'document',
  fields: [
    defineField({
      name: 'trackId',
      title: 'Track ID (app)',
      type: 'string',
      validation: (r) => r.required(),
    }),

    defineField({
      name: 'offsetMs',
      title: 'Offset (ms)',
      type: 'number',
      initialValue: 0,
      description: 'Positive pushes lyrics later; negative pulls earlier.',
      validation: (r) => r.integer(),
    }),

    defineField({
      name: 'version',
      title: 'Version',
      type: 'string',
      initialValue: 'v1',
    }),

    // NEW: paste JSON/LRC here, click Apply, it populates cues[]
    defineField({
      name: 'cuesImport',
      title: 'Import (JSON or LRC)',
      type: 'text',
      description:
        'Paste JSON array of cues, or an object {offsetMs, cues}, or LRC. Click Apply to populate cues.',
      components: {input: CuesImportInput},
    }),

    defineField({
      name: 'cues',
      title: 'Cues',
      type: 'array',
      of: [
        {
          type: 'object',
          name: 'cue',
          fields: [
            defineField({
              name: 'tMs',
              title: 'Time (ms)',
              type: 'number',
              validation: (r) => r.required().integer().min(0),
            }),
            defineField({
              name: 'endMs',
              title: 'End (ms, optional)',
              type: 'number',
              validation: (r) => r.integer().min(0),
            }),
            defineField({
              name: 'text',
              title: 'Text',
              type: 'string',
              validation: (r) => r.required(),
            }),
            defineField({
              name: 'words',
              title: 'Words (optional)',
              type: 'array',
              of: [
                {
                  type: 'object',
                  name: 'wordCue',
                  fields: [
                    defineField({name: 'tMs', type: 'number', validation: (r) => r.required().integer().min(0)}),
                    defineField({name: 'text', type: 'string', validation: (r) => r.required()}),
                  ],
                },
              ],
            }),
          ],
        },
      ],
      validation: (r) =>
        r.custom((value: unknown) => {
          if (!Array.isArray(value) || value.length === 0) return true
          let prev = -1
          for (const item of value) {
            if (!item || typeof item !== 'object') return 'Each cue must be an object.'
            const rec = item as Record<string, unknown>
            const tMs = rec.tMs
            const text = rec.text
            if (typeof tMs !== 'number' || !Number.isFinite(tMs)) return 'Each cue needs a numeric tMs.'
            if (tMs < 0) return 'Cue tMs must be >= 0.'
            if (typeof text !== 'string' || text.trim().length === 0) return 'Each cue needs non-empty text.'
            if (tMs < prev) return 'Cues must be sorted by tMs ascending.'
            prev = tMs
          }
          return true
        }),
    }),
  ],
})
