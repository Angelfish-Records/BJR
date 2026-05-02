import { NextResponse, type NextRequest } from "next/server";
import { client } from "@/sanity/lib/client";
import { urlFor } from "@/sanity/lib/image";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Visibility = "public" | "friend" | "patron" | "partner";
type PostType = "qa" | "creative" | "civic" | "cosmic";

const VALID_POST_TYPES: readonly PostType[] = [
  "qa",
  "creative",
  "civic",
  "cosmic",
];

type SanityPostDoc = {
  _id: string;
  title?: string;
  slug?: { current?: string };
  publishedAt?: string;
  pinned?: boolean;
  visibility?: Visibility;
  postType?: PostType;
  body?: unknown[];
};

type ApiImageValue = {
  _type: "image";
  url?: string;
  maxWidth?: number;
  metadata?: {
    dimensions?: { width?: number; height?: number; aspectRatio?: number };
  };
};

type ApiPost = {
  slug: string;
  title?: string;
  publishedAt: string;
  pinned?: boolean;
  visibility: Visibility;
  postType: PostType;
  body: unknown[];
};

type OkResponse = {
  ok: true;
  posts: ApiPost[];
  nextCursor: string | null;
};

function clampInt(v: string | null, def: number, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function asVisibility(v: string | null): Visibility {
  const s = (v ?? "").trim().toLowerCase();
  if (s === "friend" || s === "patron" || s === "partner") return s;
  return "public";
}

function visibilityRank(v: Visibility): number {
  if (v === "partner") return 3;
  if (v === "patron") return 2;
  if (v === "friend") return 1;
  return 0;
}

function meetsMinVisibility(postVisibility: Visibility, minVisibility: Visibility) {
  return visibilityRank(postVisibility) >= visibilityRank(minVisibility);
}

function asPostType(v: unknown): PostType {
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (VALID_POST_TYPES.includes(s as PostType)) return s as PostType;
  }
  return "creative";
}

function parsePostTypeFilter(v: string | null): PostType | null {
  const s = (v ?? "").trim().toLowerCase();
  if (!s || s === "all") return null;
  if (VALID_POST_TYPES.includes(s as PostType)) return s as PostType;
  return null;
}

function clampMaxWidthPx(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return undefined;
  return Math.max(160, Math.min(1400, Math.round(n)));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isImageBlock(
  v: unknown,
): v is Record<string, unknown> & { _type: "image" } {
  return isRecord(v) && v["_type"] === "image";
}

type UrlForSource = Parameters<typeof urlFor>[0];

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = clampInt(url.searchParams.get("limit"), 10, 1, 30);
  const offset = clampInt(url.searchParams.get("offset"), 0, 0, 10_000);
  const minVisibility = asVisibility(url.searchParams.get("minVisibility"));
  const postTypeFilter = parsePostTypeFilter(url.searchParams.get("postType"));

  const typeClause = postTypeFilter ? " && postType == $postType" : "";

  const docs = await client.fetch<SanityPostDoc[]>(
    `
      *[_type == "artistPost" && defined(slug.current)${typeClause}]
        | order(pinned desc, publishedAt desc)[$offset...$end]{
          _id,
          title,
          slug,
          publishedAt,
          pinned,
          visibility,
          postType,
          body
        }
    `,
    postTypeFilter
      ? { offset, end: offset + limit, postType: postTypeFilter }
      : { offset, end: offset + limit },
    { next: { tags: ["artistPost"] } },
  );

  const posts: ApiPost[] = [];

  for (const d of docs) {
    const slug = d.slug?.current?.trim() ?? "";
    if (!slug) continue;

    const visibility = d.visibility ?? "public";
    if (!meetsMinVisibility(visibility, minVisibility)) continue;

    const body = Array.isArray(d.body) ? d.body : [];

    const mappedBody = body.map((node) => {
      if (!isImageBlock(node)) return node;

      const maxWidth = clampMaxWidthPx(node["maxWidth"]);

      try {
        const url = urlFor(node as UrlForSource).width(1600).quality(80).url();
        const out: ApiImageValue = { _type: "image", url, maxWidth };
        return out;
      } catch {
        if (maxWidth !== undefined) return { ...node, maxWidth };
        return node;
      }
    });

    posts.push({
      slug,
      title: typeof d.title === "string" ? d.title : undefined,
      publishedAt:
        typeof d.publishedAt === "string"
          ? d.publishedAt
          : new Date().toISOString(),
      pinned: Boolean(d.pinned),
      visibility,
      postType: asPostType(d.postType),
      body: mappedBody,
    });
  }

  return NextResponse.json<OkResponse>(
    {
      ok: true,
      posts,
      nextCursor: docs.length === limit ? String(offset + limit) : null,
    },
    { status: 200 },
  );
}