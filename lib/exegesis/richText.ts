// web/lib/exegesis/richText.ts
import "server-only";

type PMNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
  content?: PMNode[];
};

export type TipTapDoc = {
  type: "doc";
  content?: PMNode[];
};

const ALLOWED_NODE_TYPES = new Set([
  "doc",
  "paragraph",
  "text",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "hardBreak",
  // Optional (keep if you want):
  // "heading",
]);

const ALLOWED_MARK_TYPES = new Set([
  "bold",
  "italic",
  "strike",
  "code",
  "link",
]);

const MAX_JSON_CHARS = 200_000;
const MAX_PLAIN_CHARS = 5_000;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function normalizeWhitespace(s: string): string {
  // keep newlines meaningful, but collapse internal runs
  return s
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isAllowedUrl(href: string): boolean {
  const h = href.trim();
  if (!h) return false;
  // allow relative, anchors
  if (h.startsWith("/") || h.startsWith("#")) return true;

  try {
    const u = new URL(h);
    const p = (u.protocol || "").toLowerCase();
    return p === "http:" || p === "https:" || p === "mailto:";
  } catch {
    return false;
  }
}

function sanitizeNode(node: PMNode, errors: string[]): PMNode | null {
  const type = safeString(node.type);
  if (!type) return null;

  if (!ALLOWED_NODE_TYPES.has(type)) {
    errors.push(`Disallowed node type: ${type}`);
    return null;
  }

  const out: PMNode = { type };

  // text node
  if (type === "text") {
    out.text = safeString(node.text);
  }

  type PMMark = {
    type?: string;
    attrs?: Record<string, unknown>;
  };

  function isPMMark(v: unknown): v is PMMark {
    return typeof v === "object" && v !== null;
  }

  function getMarkType(m: PMMark): string {
    return safeString(m.type);
  }

  function getMarkHref(m: PMMark): string {
    const attrs = m.attrs;
    if (!attrs || typeof attrs !== "object") return "";
    return safeString((attrs as Record<string, unknown>).href);
  }

  // marks
  if (Array.isArray(node.marks) && node.marks.length) {
    const marksOut: PMNode["marks"] = [];

    for (const raw of node.marks) {
      if (!isPMMark(raw)) continue;

      const mt = getMarkType(raw);
      if (!mt || !ALLOWED_MARK_TYPES.has(mt)) continue;

      if (mt === "link") {
        const href = getMarkHref(raw);
        if (!isAllowedUrl(href)) continue;
        marksOut.push({ type: "link", attrs: { href } });
        continue;
      }

      // other marks: keep only the type, drop attrs
      marksOut.push({ type: mt });
    }

    if (marksOut.length) out.marks = marksOut;
  }

  // attrs (only if you later allow headings, etc.)
  // For now: drop attrs except link marks (handled above)

  // children
  if (Array.isArray(node.content) && node.content.length) {
    const next: PMNode[] = [];
    for (const c of node.content) {
      if (!c || typeof c !== "object") continue;
      const sn = sanitizeNode(c as PMNode, errors);
      if (sn) next.push(sn);
    }
    if (next.length) out.content = next;
  }

  return out;
}

export function validateAndSanitizeTipTapDoc(input: unknown):
  | {
      ok: true;
      doc: TipTapDoc;
      plain: string;
    }
  | {
      ok: false;
      error: string;
    } {
  // allow null (legacy/plain-only posting)
  if (input === null || typeof input === "undefined") {
    return { ok: false, error: "Missing bodyRich." };
  }

  // cheap size guard first
  let raw = "";
  try {
    raw = JSON.stringify(input);
  } catch {
    return { ok: false, error: "Invalid bodyRich." };
  }
  if (raw.length > MAX_JSON_CHARS) {
    return { ok: false, error: "bodyRich too large." };
  }

  if (!isObj(input)) return { ok: false, error: "Invalid bodyRich." };
  if (input.type !== "doc")
    return { ok: false, error: "bodyRich must be a doc." };

  const errors: string[] = [];
  const root = sanitizeNode(input as PMNode, errors);

  if (!root || root.type !== "doc") {
    return { ok: false, error: "Invalid bodyRich doc." };
  }

  // derive plain text
  const plainParts: string[] = [];
  const walk = (n: PMNode) => {
    const t = safeString(n.type);
    if (t === "text") {
      plainParts.push(safeString(n.text));
      return;
    }
    if (t === "hardBreak") {
      plainParts.push("\n");
      return;
    }
    if (Array.isArray(n.content)) {
      for (const c of n.content) walk(c);
    }
    // paragraph/list item boundaries become newlines
    if (t === "paragraph" || t === "listItem" || t === "blockquote") {
      plainParts.push("\n");
    }
  };
  walk(root);

  const plain = normalizeWhitespace(plainParts.join(""));

  if (!plain) return { ok: false, error: "Empty comment." };
  if (plain.length > MAX_PLAIN_CHARS) {
    return { ok: false, error: "Comment too long." };
  }

  // Optional strictness: reject if we had disallowed types (instead of just stripping)
  // For now, we strip and continue; if you want strict reject:
  // if (errors.length) return { ok: false, error: errors[0] };

  return { ok: true, doc: root as TipTapDoc, plain };
}
