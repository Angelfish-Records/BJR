// web/lib/sanityClient.ts
import { createClient } from "@sanity/client";

const base = {
  projectId: process.env.SANITY_PROJECT_ID!,
  dataset: process.env.SANITY_DATASET!,
  apiVersion: process.env.SANITY_API_VERSION!,
  useCdn: false, // IMPORTANT: avoid stale audio metadata
} as const;

export const sanity = createClient({
  ...base,
  token: process.env.SANITY_API_READ_TOKEN,
});

// For server-side admin writes (create/update posts, etc.)
export const sanityWrite = createClient({
  ...base,
  token: process.env.SANITY_API_WRITE_TOKEN,
});
