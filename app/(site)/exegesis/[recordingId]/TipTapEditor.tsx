"use client";

import React from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import type { JSONContent } from "@tiptap/core";

export type TipTapDoc = {
  type: "doc";
  content?: unknown[];
};

function makeLinkSafe(href: string): string | null {
  const h = (href ?? "").trim();
  if (!h) return null;

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

function isJsonDoc(v: unknown): v is JSONContent {
  return (
    !!v && typeof v === "object" && (v as { type?: unknown }).type === "doc"
  );
}

function ToolbarBtn(props: {
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={props.title}
      disabled={props.disabled}
      onClick={props.onClick}
      className={[
        "rounded-md px-2 py-1 text-xs transition",
        props.active ? "bg-white/15" : "bg-white/5 hover:bg-white/10",
        props.disabled ? "opacity-40" : "",
      ].join(" ")}
    >
      {props.children}
    </button>
  );
}

function TipTapToolbar(props: {
  editor: ReturnType<typeof useEditor>;
  disabled?: boolean;
}) {
  const editor = props.editor;
  if (!editor) return null;

  const disabled = Boolean(props.disabled);

  return (
    <div className="mb-2 flex flex-wrap items-center gap-1">
      <ToolbarBtn
        title="Bold"
        disabled={disabled}
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        B
      </ToolbarBtn>

      <ToolbarBtn
        title="Italic"
        disabled={disabled}
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        I
      </ToolbarBtn>

      <ToolbarBtn
        title="Strike"
        disabled={disabled}
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        S
      </ToolbarBtn>

      <ToolbarBtn
        title="Inline code"
        disabled={disabled}
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        {"</>"}
      </ToolbarBtn>

      <ToolbarBtn
        title="Bullet list"
        disabled={disabled}
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        • List
      </ToolbarBtn>

      <ToolbarBtn
        title="Numbered list"
        disabled={disabled}
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1. List
      </ToolbarBtn>

      <ToolbarBtn
        title="Blockquote"
        disabled={disabled}
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        “Quote”
      </ToolbarBtn>

      <ToolbarBtn
        title="Add/edit link"
        disabled={disabled}
        active={editor.isActive("link")}
        onClick={() => {
          const prev = (editor.getAttributes("link")?.href ?? "").trim();
          const raw = window.prompt("Link URL:", prev);
          if (raw === null) return;

          const safe = makeLinkSafe(raw);
          if (!safe) {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
            return;
          }

          editor
            .chain()
            .focus()
            .extendMarkRange("link")
            .setLink({ href: safe })
            .run();
        }}
      >
        Link
      </ToolbarBtn>

      <ToolbarBtn
        title="Remove formatting"
        disabled={disabled}
        onClick={() =>
          editor.chain().focus().unsetAllMarks().clearNodes().run()
        }
      >
        Clear
      </ToolbarBtn>
    </div>
  );
}

export default function TipTapEditor(props: {
  valuePlain: string;
  valueDoc?: unknown | null;
  disabled?: boolean;
  showToolbar?: boolean;
  placeholder?: string;
  autofocus?: boolean;
  onChangePlain: (plain: string) => void;
  onChangeDoc: (doc: TipTapDoc) => void;
}) {
  const {
    valuePlain,
    disabled,
    showToolbar = true,
    placeholder = "",
    autofocus = false,
    onChangePlain,
    onChangeDoc,
  } = props;

  const editor = useEditor({
    editable: !disabled,
    autofocus: autofocus ? "end" : false,
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        horizontalRule: false,
        link: false,
      }),
      Link.configure({
        openOnClick: false,
        linkOnPaste: true,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
        validate: (href) => Boolean(makeLinkSafe(href)),
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass:
          "before:content-[attr(data-placeholder)] before:float-left before:text-white/40 before:pointer-events-none before:h-0",
      }),
    ],
    content: isJsonDoc(props.valueDoc)
      ? (props.valueDoc as JSONContent)
      : valuePlain
        ? valuePlain
        : "",
    editorProps: {
      attributes: {
        "data-placeholder": placeholder,
        class:
          "min-h-[90px] w-full rounded-md bg-black/20 p-3 text-sm outline-none disabled:opacity-50",
      },
    },
    onUpdate: ({ editor }) => {
      const plain = (editor.getText({ blockSeparator: "\n" }) ?? "").trim();
      onChangePlain(plain);
      onChangeDoc(editor.getJSON() as TipTapDoc);
    },
  });

  React.useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  React.useEffect(() => {
    if (!editor) return;

    const nextDoc = props.valueDoc;
    if (isJsonDoc(nextDoc)) {
      editor.commands.setContent(nextDoc as JSONContent, { emitUpdate: false });
      return;
    }

    const current = (editor.getText({ blockSeparator: "\n" }) ?? "").trim();
    const next = (valuePlain ?? "").trim();
    if (current === next) return;

    editor.commands.setContent(next, { emitUpdate: false });
  }, [editor, valuePlain, props.valueDoc]);

  return (
    <div>
      {showToolbar ? <TipTapToolbar editor={editor} disabled={disabled} /> : null}
      <EditorContent editor={editor} />
    </div>
  );
}