// web/app/(site)/exegesis/[recordingId]/TipTapReadOnly.tsx
"use client";

import React from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import type { JSONContent } from "@tiptap/core";

function isJsonDoc(v: unknown): v is JSONContent {
  return (
    !!v && typeof v === "object" && (v as { type?: unknown }).type === "doc"
  );
}

function hasMeaningfulContent(node: JSONContent): boolean {
  if (node.type === "hardBreak") return true;

  if (typeof node.text === "string") {
    return node.text.trim().length > 0;
  }

  return (
    Array.isArray(node.content) &&
    node.content.some(hasMeaningfulContent)
  );
}

function normalizeReadOnlyDoc(doc: JSONContent): JSONContent {
  const content = [...(doc.content ?? [])];

  while (content.length > 1) {
    const last = content.at(-1);

    if (
      last?.type !== "paragraph" ||
      hasMeaningfulContent(last)
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

function makeLinkSafe(href: string): string | null {
  const h = (href ?? "").trim();
  if (!h) return null;

  // allow anchors and relative URLs
  if (h.startsWith("#") || h.startsWith("/")) return h;

  try {
    const u = new URL(h);
    const p = (u.protocol || "").toLowerCase();
    if (p === "http:" || p === "https:" || p === "mailto:") return u.toString();
    return null;
  } catch {
    return null;
  }
}

export default function TipTapReadOnly(
  props: Readonly<{ doc: unknown }>,
) {
  const { doc } = props;

  const displayDoc = React.useMemo(
    () => (isJsonDoc(doc) ? normalizeReadOnlyDoc(doc) : null),
    [doc],
  );

  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        horizontalRule: false,
        link: false, // prevent duplicate name; we add Link below
      }),
      Link.configure({
        openOnClick: true,
        linkOnPaste: false,
        autolink: false,
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: "_blank",
        },
        validate: (href) => Boolean(makeLinkSafe(href)),
      }),
    ],
    content: "", // set via effect
    editorProps: {
      attributes: {
        class: [
          "text-sm leading-relaxed",
          "[&_p]:my-0",
          "[&_p+ul]:mt-3 [&_p+ol]:mt-3 [&_p+blockquote]:mt-3",
          "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6",
          "[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6",
          "[&_li]:my-1.5 [&_li>p]:my-0",
          "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-white/20 [&_blockquote]:pl-4 [&_blockquote]:text-white/70 [&_blockquote]:italic",
          "[&_code]:rounded-md [&_code]:border [&_code]:border-white/10 [&_code]:bg-white/[0.06] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.92em] [&_code]:text-white/95",
          "[&_a]:text-white [&_a]:underline [&_a]:decoration-white/35 [&_a]:underline-offset-4",
          "[&_a:hover]:decoration-white/70",
        ].join(" "),
      },
    },
  });

  React.useEffect(() => {
    if (!editor) return;

    if (!displayDoc) {
      editor.commands.setContent("", { emitUpdate: false });
      return;
    }

    editor.commands.setContent(displayDoc, { emitUpdate: false });
  }, [editor, displayDoc]);

  if (!displayDoc || !editor) return null;

  return <EditorContent editor={editor} />;
}
