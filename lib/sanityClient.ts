// web/lib/sanityClient.ts
import { createClient } from "@sanity/client";
import { apiVersion, dataset, projectId } from "@/sanity/lib/serverEnv";

const base = {
  projectId,
  dataset,
  apiVersion,
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
