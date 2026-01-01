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

  basePath: '/studio',

  projectId: 'c16lgt95',
  dataset: 'production',
  apiVersion: '2025-01-01',

  schema,

  document: {
    newDocumentOptions: (prev, context) => {
      if (context.creationContext.type === 'global') {
        return prev.filter((opt) => opt.templateId !== 'landingPage')
      }
      return prev
    },
    actions: (prev, context) => {
      if (context.schemaType === 'landingPage') {
        return prev.filter((a) => a.action !== 'delete' && a.action !== 'duplicate')
      }
      return prev
    },
  },

  plugins: [
    structureTool({structure}),
    visionTool({defaultApiVersion: '2025-01-01'}),
  ],
})
