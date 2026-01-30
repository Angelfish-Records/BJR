"use client";

import { NextStudio } from "next-sanity/studio";
import config from "../../../sanity.config";

// Ensure Next doesn't try to prerender this route at build time
export const dynamic = "force-dynamic";

export default function StudioPage() {
  return <NextStudio config={config} />;
}
