// web/app/api/revalidate/route.ts
import { revalidatePath, revalidateTag } from "next/cache";

type SanityWebhookPayload = {
  _id?: string;
  _type?: string;
  type?: string;
  document?: {
    _id?: string;
    _type?: string;
  };
};

const CACHE_PROFILE = "default" as const;

function getBearerToken(authHeader: string): string {
  const trimmed = authHeader.trim();
  const prefix = "bearer";

  if (trimmed.length <= prefix.length) return "";
  if (trimmed.slice(0, prefix.length).toLowerCase() !== prefix) return "";

  const separator = trimmed.charAt(prefix.length);
  if (separator !== " " && separator !== "\t") return "";

  const token = trimmed.slice(prefix.length + 1).trim();
  return token;
}

function getAuthSecret(req: Request): string {
  const auth = req.headers.get("authorization") || "";
  const bearerToken = getBearerToken(auth);
  if (bearerToken) return bearerToken;

  const headerSecret = req.headers.get("x-webhook-secret");
  if (headerSecret) return headerSecret.trim();

  const url = new URL(req.url);
  const qsSecret = url.searchParams.get("secret");
  if (qsSecret) return qsSecret.trim();

  return "";
}

function getDocMeta(body: SanityWebhookPayload | null): {
  docType: string | null;
  docId: string | null;
} {
  const docType = body?._type ?? body?.type ?? body?.document?._type ?? null;
  const docId = body?._id ?? body?.document?._id ?? null;
  return { docType, docId };
}

export async function POST(req: Request) {
  const expected = process.env.SANITY_REVALIDATE_SECRET || "";
  if (!expected)
    return new Response("Missing SANITY_REVALIDATE_SECRET", { status: 500 });

  const provided = getAuthSecret(req);
  if (provided !== expected)
    return new Response("Unauthorized", { status: 401 });

  let body: SanityWebhookPayload | null = null;
  try {
    body = (await req.json()) as SanityWebhookPayload;
  } catch {}

  const { docType, docId } = getDocMeta(body);

  const reTag = (t: string) => revalidateTag(t, CACHE_PROFILE);

  // Back-compat: missing docType => treat as landing change.
  if (!docType) {
    reTag("landingPage");
    revalidatePath("/");
    return Response.json({
      ok: true,
      docType: null,
      docId,
      revalidated: ["landingPage"],
      path: "/",
    });
  }

  const tags: string[] = [];

  // Landing singleton (support both type-based and id-based routing)
  if (docType === "landingPage" || docId === "landingPage") {
    tags.push("landingPage");
    revalidatePath("/");
  }

  // Site flags singleton
  if (docType === "siteFlags" || docId === "siteFlags") {
    tags.push("siteFlags");
  }

  // Shadow home pages
  if (docType === "shadowHomePage") {
    tags.push("shadowHome");
  }

  // Portal configuration. The broad tag is sufficient because every portal
  // page cache entry also carries the shared "portalPage" tag.
  if (docType === "portalPage") {
    tags.push("portalPage");
    revalidatePath("/portal");
  }

  // Album metadata, tracks, browse lists, and canonical metadata helpers.
  if (docType === "album") {
    tags.push("albums");
    revalidatePath("/albums");
  }

  // Lyrics are independently cached, but album payload construction depends on
  // them, so invalidate both cache families together.
  if (docType === "lyrics") {
    tags.push("lyrics");
    tags.push("albums");
    revalidatePath("/albums");
  }

  // Never silently ignore: if we do not recognise the document type, retain
  // the existing low-cost landing-page fallback.
  if (tags.length === 0) {
    tags.push("landingPage");
    revalidatePath("/");

    for (const tag of tags) reTag(tag);

    return Response.json({
      ok: true,
      docType,
      docId,
      revalidated: tags,
      note: "Unknown docType; defaulted to landingPage revalidation",
      path: "/",
    });
  }

  for (const tag of tags) reTag(tag);

  return Response.json({ ok: true, docType, docId, revalidated: tags });
}
