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
  title: 'Sanity Studio - CONFIG TEST',

  // Embedded Studio route
  basePath: '/studio',

  // Sanity project settings
  projectId: 'c16lgt95',
  dataset: 'production',
  apiVersion: '2025-01-01',

  schema,

  // Studio-level enforcement for the singleton behaviour
  document: {
    // Prevent creating landingPage from the global "Create new" flows
    newDocumentOptions: (prev, context) => {
      // Only filter for the main “create new” context; keep other contexts unchanged
      if (context.creationContext.type === 'global') {
        return prev.filter((opt) => opt.templateId !== 'landingPage')
      }
      return prev
    },

    // Prevent duplicate/delete actions for landingPage docs
    actions: (prev, context) => {
      if (context.schemaType === 'landingPage') {
        return prev.filter((action) => action.action !== 'delete' && action.action !== 'duplicate')
      }
      return prev
    },
  },

  plugins: [
    structureTool({structure}),
    visionTool({defaultApiVersion: '2025-01-01'}),
  ],
})
