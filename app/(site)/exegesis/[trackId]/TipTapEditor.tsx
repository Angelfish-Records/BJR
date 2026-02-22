"use client";

import React from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";

export type TipTapDoc = {
  type: "doc";
  content?: unknown[];
};

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

export default function TipTapEditor(props: {
  valuePlain: string;
  disabled?: boolean;
  onChangePlain: (plain: string) => void;
  onChangeDoc: (doc: TipTapDoc) => void;
}) {
  const { valuePlain, disabled, onChangePlain, onChangeDoc } = props;

  const editor = useEditor({
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        horizontalRule: false,
        link: false, // IMPORTANT: prevent duplicate 'link' extension name
      }),
      Link.configure({
        openOnClick: true,
        linkOnPaste: true,
        autolink: true,
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: "_blank",
        },
        validate: (href) => Boolean(makeLinkSafe(href)),
      }),
    ],
    content: valuePlain ? valuePlain : "",
    editorProps: {
      attributes: {
        class:
          "min-h-[90px] w-full rounded-md bg-black/20 p-3 text-sm outline-none disabled:opacity-50",
      },
    },
    onUpdate: ({ editor }) => {
      const plain = (editor.getText({ blockSeparator: "\n" }) ?? "").trim();
      // preserve your existing UX: show char count based on trimmed text
      onChangePlain(plain);
      onChangeDoc(editor.getJSON() as TipTapDoc);
    },
  });

  // Keep editor editable flag in sync
  React.useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  // If external value changes (rare), update editor content
  React.useEffect(() => {
    if (!editor) return;
    const current = (editor.getText() ?? "").trim();
    const next = (valuePlain ?? "").trim();
    if (current === next) return;
    editor.commands.setContent(next, { emitUpdate: false });
  }, [editor, valuePlain]);

  return <EditorContent editor={editor} />;
}
