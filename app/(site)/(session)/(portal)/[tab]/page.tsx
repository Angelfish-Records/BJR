export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default function PortalTabCanonicalPage() {
  // Canonical URL surface only.
  // Render happens in /(session)/@runtime/[tab]/page.tsx
  return null;
}