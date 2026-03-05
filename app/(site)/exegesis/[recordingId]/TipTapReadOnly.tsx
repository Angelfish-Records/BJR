// web/app/(site)/exegesis/[recordingId]/TipTapReadOnly.tsx
"use client";

import React from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import type { JSONContent } from "@tiptap/core";

function isJsonDoc(v: unknown): v is JSONContent {
  return !!v && typeof v === "object" && (v as { type?: unknown }).type === "doc";
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

export default function TipTapReadOnly(props: { doc: unknown }) {
  const { doc } = props;

  const editor = useEditor({
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
        class: "text-sm leading-relaxed",
      },
    },
  });

  React.useEffect(() => {
    if (!editor) return;

    if (!isJsonDoc(doc)) {
      editor.commands.setContent("", { emitUpdate: false });
      return;
    }

    editor.commands.setContent(doc, { emitUpdate: false });
  }, [editor, doc]);

  if (!isJsonDoc(doc)) return null;

  return <EditorContent editor={editor} />;
}