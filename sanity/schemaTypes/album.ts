// sanity/schemaTypes/album.ts
import {defineType, defineField} from 'sanity'

const THEME_OPTIONS = [
  {title: 'Nebula', value: 'nebula'},
  {title: 'Gravitational Lattice', value: 'gravitational-lattice'},
  {title: 'Orbital Script', value: 'orbital-script'},
  {title: 'Phase Glass', value: 'phase-glass'},
  {title: 'Reaction Veins', value: 'reaction-veins'},
  {title: 'Pressure Glass', value: 'pressure-glass'},
  {title: 'MHD Silk', value: 'mhd-silk'},
  {title: 'Dream Fog', value: 'dream-fog'},
  {title: 'Filament Storm', value: 'filament-storm'},
  {title: 'Mosaic Drift', value: 'mosaic-drift'},
  {title: 'Oil Flow', value: 'oil-flow'},
  {title: 'Starfall Canopy', value: 'starfall-canopy'},
]

const TIER_OPTIONS = [
  {title: 'Friend', value: 'friend'},
  {title: 'Patron', value: 'patron'},
  {title: 'Partner', value: 'partner'},
] as const

type AlbumDocForVisibility = {
  earlyAccessEnabled?: boolean
}

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
        'Stable canonical ID for this album (label catalogue). Used for entitlements and future variants. Example: AF-ALB-0001',
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

    // ---- Release + access policy (Approach A) ----

    defineField({
      name: 'publicPageVisible',
      title: 'Public page visible',
      type: 'boolean',
      description: 'If disabled, hide from browse and block direct load (useful for drafts).',
      initialValue: true,
    }),

    defineField({
      name: 'releaseAt',
      title: 'Public release date/time',
      type: 'datetime',
      description:
        'If set in the future, playback is embargoed for the public unless entitlements grant access.',
    }),

    defineField({
      name: 'embargoNote',
      title: 'Embargo note (UI)',
      type: 'text',
      rows: 3,
      description:
        'Optional message shown on embargoed albums explaining why playback is disabled (public users).',
      hidden: ({document}) => {
        const d = document as {releaseAt?: string} | undefined
        return !d?.releaseAt
      },
    }),

    defineField({
      name: 'earlyAccessEnabled',
      title: 'Enable early access during embargo',
      type: 'boolean',
      initialValue: true,
      description:
        'Editorial flag. If enabled and releaseAt is in the future, selected tiers may be granted early access.',
    }),

    defineField({
      name: 'earlyAccessTiers',
      title: 'Early access tiers',
      type: 'array',
      of: [{type: 'string'}],
      options: {list: TIER_OPTIONS as unknown as {title: string; value: string}[]},
      initialValue: ['patron', 'partner'],
      hidden: ({document}) => !((document as AlbumDocForVisibility | undefined)?.earlyAccessEnabled),
      description: 'Editorial guidance for which tiers should bypass embargo (entitlements still decide).',
    }),

    defineField({
      name: 'minTierToLoad',
      title: 'Minimum tier to load album',
      type: 'string',
      options: {list: [{title: 'None', value: ''}, ...(TIER_OPTIONS as unknown as {title: string; value: string}[])]},
      description:
        'If set, the album is locked in Browse and via /api/albums/:slug unless the viewer is at this tier or higher.',
    }),

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
