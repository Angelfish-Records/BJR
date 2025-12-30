import {createClient} from 'next-sanity'

export const client = createClient({
  projectId: 'c16lgt95',
  dataset: 'production',
  apiVersion: '2025-01-01',
  useCdn: true,
})
