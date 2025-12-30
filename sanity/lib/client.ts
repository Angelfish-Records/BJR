import {createClient} from 'next-sanity'

export const projectId = 'c16lgt95'
export const dataset = 'production'
export const apiVersion = '2025-01-01'

export const client = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: true,
})
