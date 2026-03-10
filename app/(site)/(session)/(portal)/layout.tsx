// web/app/(site)/(session)/(portal)/layout.tsx
import React from "react";
import type { Metadata } from "next";

import { client } from "@/sanity/lib/client";

export async function generateMetadata(): Promise<Metadata> {
  const page = await client.fetch<{ subtitle?: string }>(
    `*[_type == "shadowHomePage" && slug.current == "home"][0]{ subtitle }`,
    {},
    { next: { tags: ["shadowHome"] } },
  );

  return {
    title: "Brendan John Roch",
    description: page?.subtitle ?? "Music, posts, downloads, and more.",
  };
}

export default async function PortalLayout(props: {
  children: React.ReactNode;
}) {
  return props.children;
}
