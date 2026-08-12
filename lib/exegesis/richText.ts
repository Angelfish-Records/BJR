// web/lib/exegesis/richText.ts
import "server-only";

type PMMark = {
  type?: string;
  attrs?: Record<string, unknown>;
};

type PMNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: PMMark[];
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
    .replaceAll("\r\n", "\n")
    .replaceAll(/[ \t]+/g, " ")
    .replaceAll(/\n{3,}/g, "\n\n")
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

function isPMMark(v: unknown): v is PMMark {
  return typeof v === "object" && v !== null;
}

function getMarkType(mark: PMMark): string {
  return safeString(mark.type);
}

function getMarkHref(mark: PMMark): string {
  const attrs = mark.attrs;
  if (!attrs || typeof attrs !== "object") return "";
  return safeString(attrs.href);
}

function sanitizeMark(raw: unknown): PMMark | null {
  if (!isPMMark(raw)) return null;

  const type = getMarkType(raw);
  if (!type || !ALLOWED_MARK_TYPES.has(type)) return null;

  if (type !== "link") {
    // Non-link marks keep only their type; all attrs are dropped.
    return { type };
  }

  const href = getMarkHref(raw);
  if (!isAllowedUrl(href)) return null;

  return { type: "link", attrs: { href } };
}

function sanitizeMarks(marks: PMNode["marks"]): PMNode["marks"] | undefined {
  if (!Array.isArray(marks) || marks.length === 0) return undefined;

  const sanitized: PMMark[] = [];
  for (const raw of marks) {
    const mark = sanitizeMark(raw);
    if (mark) sanitized.push(mark);
  }

  return sanitized.length > 0 ? sanitized : undefined;
}

function sanitizeChildren(
  content: PMNode["content"],
  errors: string[],
): PMNode["content"] | undefined {
  if (!Array.isArray(content) || content.length === 0) return undefined;

  const sanitized: PMNode[] = [];
  for (const child of content) {
    if (!child || typeof child !== "object") continue;

    const next = sanitizeNode(child as PMNode, errors);
    if (next) sanitized.push(next);
  }

  return sanitized.length > 0 ? sanitized : undefined;
}

function sanitizeNode(node: PMNode, errors: string[]): PMNode | null {
  const type = safeString(node.type);
  if (!type) return null;

  if (!ALLOWED_NODE_TYPES.has(type)) {
    errors.push(`Disallowed node type: ${type}`);
    return null;
  }

  const out: PMNode = { type };

  if (type === "text") {
    out.text = safeString(node.text);
  }

  const marks = sanitizeMarks(node.marks);
  if (marks) {
    out.marks = marks;
  }

  // Node attrs remain intentionally dropped. Link-mark href is the only
  // attribute currently preserved.
  const content = sanitizeChildren(node.content, errors);
  if (content) {
    out.content = content;
  }

  return out;
}

function nodeHasMeaningfulContent(node: PMNode): boolean {
  const type = safeString(node.type);

  if (type === "hardBreak") return true;

  if (type === "text") {
    return safeString(node.text).trim().length > 0;
  }

  return (
    Array.isArray(node.content) &&
    node.content.some(nodeHasMeaningfulContent)
  );
}

function trimTrailingEmptyTopLevelParagraphs(
  doc: TipTapDoc,
): TipTapDoc {
  const content = [...(doc.content ?? [])];

  while (content.length > 1) {
    const last = content[content.length - 1];

    if (
      !last ||
      safeString(last.type) !== "paragraph" ||
      nodeHasMeaningfulContent(last)
    ) {
      break;
    }

    content.pop();
  }

  return {
    ...doc,
    content,
  };
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
  if (input === null || input === undefined) {
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

  if (root?.type !== "doc") {
    return { ok: false, error: "Invalid bodyRich doc." };
  }

  const sanitizedDoc = trimTrailingEmptyTopLevelParagraphs(
    root as TipTapDoc,
  );

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
  walk(sanitizedDoc);

  const plain = normalizeWhitespace(plainParts.join(""));

  if (!plain) return { ok: false, error: "Empty comment." };
  if (plain.length > MAX_PLAIN_CHARS) {
    return { ok: false, error: "Comment too long." };
  }

  // Optional strictness: reject if we had disallowed types (instead of just stripping)
  // For now, we strip and continue; if we want strict reject:
  // if (errors.length) return { ok: false, error: errors[0] };

  return { ok: true, doc: sanitizedDoc, plain };
}
