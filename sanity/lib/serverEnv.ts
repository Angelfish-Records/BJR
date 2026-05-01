function pickFirst(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function requireServerEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing Sanity server configuration: ${name}`);
  }
  return value;
}

export const projectId = requireServerEnv(
  "SANITY_PROJECT_ID or NEXT_PUBLIC_SANITY_PROJECT_ID",
  pickFirst(
    process.env.SANITY_PROJECT_ID,
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  ),
);

export const dataset = requireServerEnv(
  "SANITY_DATASET or NEXT_PUBLIC_SANITY_DATASET",
  pickFirst(
    process.env.SANITY_DATASET,
    process.env.NEXT_PUBLIC_SANITY_DATASET,
  ),
);

export const apiVersion = pickFirst(
  process.env.SANITY_API_VERSION,
  process.env.NEXT_PUBLIC_SANITY_API_VERSION,
  "2025-01-01",
);