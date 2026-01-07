// web/lib/sanityClient.ts
import {createClient} from '@sanity/client'

export const sanity = createClient({
  projectId: process.env.SANITY_PROJECT_ID!,
  dataset: process.env.SANITY_DATASET!,
  apiVersion: process.env.SANITY_API_VERSION!,
  useCdn: false, // IMPORTANT: avoid stale audio metadata
  token: process.env.SANITY_API_READ_TOKEN,
})
