'use client'

/**
 * Sanity Studio configuration (embedded in Next.js at /studio)
 */

import {defineConfig} from 'sanity'
import {visionTool} from '@sanity/vision'
import {structureTool} from 'sanity/structure'

import {schema} from './sanity/schemaTypes'
import {structure} from './sanity/structure'

export default defineConfig({
  name: 'default',
  title: 'Sanity Studio',

  // Embedded Studio route
  basePath: '/studio',

  // Sanity project settings
  projectId: 'c16lgt95',
  dataset: 'production',
  apiVersion: '2025-01-01',

  schema,

  plugins: [
    structureTool({structure}),
    visionTool({defaultApiVersion: '2025-01-01'}),
  ],
})
