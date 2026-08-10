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

const IMMEDIATE_REVALIDATION = { expire: 0 } as const;

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

  const reTag = (tag: string) => revalidateTag(tag, IMMEDIATE_REVALIDATION);

  if (!docType) {
    return Response.json({
      ok: true,
      docType: null,
      docId,
      revalidated: [],
      note: "Missing document type; no cache invalidation performed",
    });
  }

  const tags: string[] = [];

  // Site configuration singleton
  if (docType === "siteFlags" || docId === "siteFlags") {
    tags.push("siteFlags");
  }

  // Shadow home pages
  if (docType === "shadowHomePage") {
    tags.push("shadowHome");
  }

  // Badge definitions are cached independently from member-specific grants.
  if (docType === "badgeDefinition") {
    tags.push("badgeDefinitions");
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
    revalidatePath("/album/[slug]", "page");
    revalidatePath("/album/[slug]/track/[displayId]", "page");
  }

  // Lyrics are independently cached, but album payload construction depends on
  // them, so invalidate both cache families together.
  if (docType === "lyrics") {
    tags.push("lyrics", "albums");
    revalidatePath("/album/[slug]", "page");
    revalidatePath("/album/[slug]/track/[displayId]", "page");
  }

  if (tags.length === 0) {
    return Response.json({
      ok: true,
      docType,
      docId,
      revalidated: [],
      note: "No cache invalidation configured for this document type",
    });
  }

  for (const tag of tags) reTag(tag);

  return Response.json({ ok: true, docType, docId, revalidated: tags });
}
