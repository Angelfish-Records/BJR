"use client";

import React from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import type { Editor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";

export type TipTapDoc = {
  type: "doc";
  content?: unknown[];
};

type LinkDraft = {
  open: boolean;
  href: string;
  text: string;
};

function makeLinkSafe(href: string): string | null {
  const h = (href ?? "").trim();
  if (!h) return null;

  if (h.startsWith("#") || h.startsWith("/")) return h;

  try {
    const withProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(h)
      ? h
      : `https://${h}`;
    const u = new URL(withProtocol);
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

function IconBold() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4">
      <path
        d="M6 3.5h5.25a3.25 3.25 0 0 1 0 6.5H6zm0 6.5h6a3.5 3.5 0 0 1 0 7H6z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconItalic() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4">
      <path
        d="M12.5 3.5h-4m3 0-3 13m-1 0h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconStrike() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4">
      <path
        d="M14.75 5.5c-.75-1.1-2.1-1.75-4-1.75-2.3 0-3.75 1.1-3.75 2.75 0 1.3.95 2.15 2.95 2.7l1.95.55c2.15.6 3.1 1.45 3.1 2.9 0 2.15-1.95 3.6-4.85 3.6-2.25 0-4.05-.8-5.15-2.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 10h12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconCode() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4">
      <path
        d="M7.25 6 3.75 10l3.5 4M12.75 6l3.5 4-3.5 4M11 4 9 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconLink() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4">
      <path
        d="M8.25 11.75 11.75 8.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M8 13.5H6.75A3.25 3.25 0 1 1 6.75 7h1.5M12 6.5h1.25A3.25 3.25 0 1 1 13.25 13h-1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconBulletList() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4">
      <circle cx="4.25" cy="5.25" r="1.2" fill="currentColor" />
      <circle cx="4.25" cy="10" r="1.2" fill="currentColor" />
      <circle cx="4.25" cy="14.75" r="1.2" fill="currentColor" />
      <path
        d="M8 5.25h8M8 10h8M8 14.75h8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconOrderedList() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4">
      <path
        d="M3.5 4.5h1.5v4M3.25 9h2.25M3.5 12.25h1.5c.8 0 1.35.45 1.35 1.1 0 .45-.25.8-.75 1 .65.18 1 .58 1 1.15 0 .95-.75 1.5-1.9 1.5H3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 5.25h6.5M10 10h6.5M10 14.75h6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconQuote() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4">
      <path
        d="M6.25 6.25c-1.7.95-2.5 2.25-2.5 4v2.25h4.5v-2.25H6.1c0-1 .4-1.75 1.35-2.45zM13 6.25c-1.7.95-2.5 2.25-2.5 4v2.25H15v-2.25h-2.15c0-1 .4-1.75 1.35-2.45z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconClear() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4">
      <path
        d="M4.75 4.75 15.25 15.25M12.75 4.75H8.25c-1.9 0-3 1.1-3 3v4.5c0 1.9 1.1 3 3 3h4.5c1.9 0 3-1.1 3-3V7.75c0-1.9-1.1-3-3-3Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ToolbarSeparator() {
  return <div className="h-5 w-px shrink-0 bg-white/10" aria-hidden="true" />;
}

type ToolbarBtnProps = Readonly<{
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}>;

function ToolbarBtn({
  title,
  onClick,
  active,
  disabled,
  children,
}: ToolbarBtnProps) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={[
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition",
        "bg-transparent text-white/60",
        "hover:bg-white/[0.06] hover:text-white/95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
        active ? "bg-white/[0.08] text-white" : "",
        disabled ? "cursor-not-allowed opacity-35" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function applyListToggle(editor: Editor, mode: "bullet" | "ordered") {
  const chain = editor.chain().focus();

  if (mode === "bullet") {
    if (editor.isActive("orderedList")) {
      chain.liftListItem("listItem").toggleBulletList().run();
      return;
    }
    chain.toggleBulletList().run();
    return;
  }

  if (editor.isActive("bulletList")) {
    chain.liftListItem("listItem").toggleOrderedList().run();
    return;
  }
  chain.toggleOrderedList().run();
}

function applyBlockquoteToggle(editor: Editor) {
  editor.chain().focus().toggleBlockquote().run();
}

function getSelectedText(editor: Editor): string {
  const { from, to, empty } = editor.state.selection;
  if (empty) return "";
  return editor.state.doc.textBetween(from, to, " ").trim();
}

function openLinkDraft(editor: Editor, setDraft: (next: LinkDraft) => void) {
  const selectedText = getSelectedText(editor);
  const currentHref = String(editor.getAttributes("link")?.href ?? "").trim();

  setDraft({
    open: true,
    href: currentHref,
    text: selectedText,
  });
}

function submitLinkDraft(editor: Editor, draft: LinkDraft, close: () => void) {
  const safeHref = makeLinkSafe(draft.href);
  if (!safeHref) {
    close();
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    return;
  }

  const selectedText = getSelectedText(editor);
  const explicitText = draft.text.trim();

  editor.chain().focus().extendMarkRange("link").unsetLink().run();

  if (selectedText) {
    editor.chain().focus().setLink({ href: safeHref }).run();
    close();
    return;
  }

  const textToInsert = explicitText || safeHref;
  editor
    .chain()
    .focus()
    .insertContent(textToInsert)
    .setTextSelection({
      from: editor.state.selection.from - textToInsert.length,
      to: editor.state.selection.from,
    })
    .setLink({ href: safeHref })
    .run();

  close();
}

function TipTapToolbar(
  props: Readonly<{ editor: Editor | null; disabled?: boolean }>,
) {
  const editor = props.editor;
  const disabled = Boolean(props.disabled);

  const [linkDraft, setLinkDraft] = React.useState<LinkDraft>({
    open: false,
    href: "",
    text: "",
  });

  const hrefInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!linkDraft.open) return;
    const t = window.setTimeout(() => hrefInputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [linkDraft.open]);

  React.useEffect(() => {
    if (!editor) return;
    const handleSelectionUpdate = () => {
      if (!linkDraft.open) return;
      const selectedText = getSelectedText(editor);
      setLinkDraft((prev) => ({
        ...prev,
        text: selectedText || prev.text,
      }));
    };

    editor.on("selectionUpdate", handleSelectionUpdate);
    return () => {
      editor.off("selectionUpdate", handleSelectionUpdate);
    };
  }, [editor, linkDraft.open]);

  if (!editor) return null;

  return (
    <div className="px-3 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <ToolbarBtn
          title="Bold"
          disabled={disabled}
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <IconBold />
        </ToolbarBtn>

        <ToolbarBtn
          title="Italic"
          disabled={disabled}
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <IconItalic />
        </ToolbarBtn>

        <ToolbarBtn
          title="Strike"
          disabled={disabled}
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <IconStrike />
        </ToolbarBtn>

        <ToolbarBtn
          title="Inline code"
          disabled={disabled}
          active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <IconCode />
        </ToolbarBtn>

        <ToolbarSeparator />

        <ToolbarBtn
          title="Add/edit link"
          disabled={disabled}
          active={editor.isActive("link") || linkDraft.open}
          onClick={() => openLinkDraft(editor, setLinkDraft)}
        >
          <IconLink />
        </ToolbarBtn>

        <ToolbarBtn
          title="Bullet list"
          disabled={disabled}
          active={editor.isActive("bulletList")}
          onClick={() => applyListToggle(editor, "bullet")}
        >
          <IconBulletList />
        </ToolbarBtn>

        <ToolbarBtn
          title="Numbered list"
          disabled={disabled}
          active={editor.isActive("orderedList")}
          onClick={() => applyListToggle(editor, "ordered")}
        >
          <IconOrderedList />
        </ToolbarBtn>

        <ToolbarSeparator />

        <ToolbarBtn
          title="Blockquote"
          disabled={disabled}
          active={editor.isActive("blockquote")}
          onClick={() => applyBlockquoteToggle(editor)}
        >
          <IconQuote />
        </ToolbarBtn>

        <ToolbarBtn
          title="Remove formatting"
          disabled={disabled}
          onClick={() => {
            setLinkDraft({ open: false, href: "", text: "" });
            editor.chain().focus().unsetAllMarks().clearNodes().run();
          }}
        >
          <IconClear />
        </ToolbarBtn>
      </div>

      {linkDraft.open ? (
        <div className="mt-3 rounded-xl bg-white/[0.04] p-3">
          <div className="grid gap-2">
            <input
              ref={hrefInputRef}
              type="text"
              value={linkDraft.href}
              disabled={disabled}
              onChange={(e) =>
                setLinkDraft((prev) => ({ ...prev, href: e.target.value }))
              }
              placeholder="Paste link URL"
              className="h-10 rounded-lg bg-black/[0.16] px-3 text-sm text-white/90 outline-none placeholder:text-white/30"
            />

            <input
              type="text"
              value={linkDraft.text}
              disabled={disabled}
              onChange={(e) =>
                setLinkDraft((prev) => ({ ...prev, text: e.target.value }))
              }
              placeholder="Link text"
              className="h-10 rounded-lg bg-black/[0.16] px-3 text-sm text-white/90 outline-none placeholder:text-white/30"
            />
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => setLinkDraft({ open: false, href: "", text: "" })}
              className="inline-flex h-9 items-center justify-center rounded-lg px-3 text-sm text-white/60 transition hover:bg-white/[0.06] hover:text-white/92 disabled:opacity-35"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={disabled || !linkDraft.href.trim()}
              onClick={() =>
                submitLinkDraft(editor, linkDraft, () =>
                  setLinkDraft({ open: false, href: "", text: "" }),
                )
              }
              className="inline-flex h-9 items-center justify-center rounded-lg bg-white/[0.08] px-3 text-sm text-white/92 transition hover:bg-white/[0.14] disabled:opacity-35"
            >
              Apply link
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function TipTapEditor(
  props: Readonly<{
    valuePlain: string;
    valueDoc?: unknown;
    disabled?: boolean;
    showToolbar?: boolean;
    placeholder?: string;
    autofocus?: boolean;
    onChangePlain: (plain: string) => void;
    onChangeDoc: (doc: TipTapDoc) => void;
  }>,
) {
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
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        horizontalRule: false,
        link: false,
        blockquote: {
          HTMLAttributes: {
            class: "af-tiptap-blockquote",
          },
        },
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false,
        },
      }),
      Link.configure({
        openOnClick: true,
        linkOnPaste: true,
        autolink: true,
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: "_blank",
          class: "af-tiptap-link",
        },
        validate: (href) => Boolean(makeLinkSafe(href)),
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass:
          "before:pointer-events-none before:float-left before:h-0 before:text-white/35 before:content-[attr(data-placeholder)]",
      }),
    ],
    content: isJsonDoc(props.valueDoc)
      ? (props.valueDoc as JSONContent)
      : valuePlain,
    editorProps: {
      attributes: {
        "data-placeholder": placeholder,
        class: [
          "tiptap-editor min-h-[120px] w-full px-4 py-3 text-[15px] leading-7 text-white/92 outline-none",
          "bg-transparent",
          "selection:bg-white/15",
          "disabled:opacity-50",
          "[&_p]:my-0",
          "[&_p+ul]:mt-3 [&_p+ol]:mt-3 [&_p+blockquote]:mt-3",
          "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6",
          "[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6",
          "[&_li]:my-1.5 [&_li>p]:my-0",
          "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-white/20 [&_blockquote]:pl-4 [&_blockquote]:text-white/70 [&_blockquote]:italic",
          "[&_code]:rounded-md [&_code]:border [&_code]:border-white/10 [&_code]:bg-white/[0.06] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.92em] [&_code]:text-white/95",
          "[&_a]:text-white [&_a]:underline [&_a]:decoration-white/35 [&_a]:underline-offset-4",
          "[&_a:hover]:decoration-white/70",
          "[&_.ProseMirror-focused]:outline-none",
        ].join(" "),
      },
      handleDOMEvents: {
        mousedown: (_view, event) => {
          const target = event.target;
          if (!(target instanceof HTMLElement)) return false;
          if (target.closest("[data-af-link-toolbar]")) return true;
          return false;
        },
      },
    },
    onUpdate: ({ editor: nextEditor }) => {
      const json = nextEditor.getJSON() as TipTapDoc;
      lastAppliedExternalRef.current = JSON.stringify(json);
      const plain = (nextEditor.getText({ blockSeparator: "\n" }) ?? "").trim();
      onChangePlain(plain);
      onChangeDoc(json);
    },
  });

  React.useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  const lastAppliedExternalRef = React.useRef<string>("");

  React.useEffect(() => {
    if (!editor) return;

    const nextDoc = props.valueDoc;
    const nextExternal = isJsonDoc(nextDoc)
      ? JSON.stringify(nextDoc)
      : JSON.stringify({ type: "plain", value: valuePlain ?? "" });

    const currentJson = JSON.stringify(editor.getJSON());

    if (nextExternal === lastAppliedExternalRef.current) return;
    if (isJsonDoc(nextDoc) && currentJson === JSON.stringify(nextDoc)) {
      lastAppliedExternalRef.current = nextExternal;
      return;
    }

    if (isJsonDoc(nextDoc)) {
      editor.commands.setContent(nextDoc as JSONContent, { emitUpdate: false });
      lastAppliedExternalRef.current = nextExternal;
      return;
    }

    const current = (editor.getText({ blockSeparator: "\n" }) ?? "").trim();
    const next = (valuePlain ?? "").trim();
    if (current === next) {
      lastAppliedExternalRef.current = nextExternal;
      return;
    }

    editor.commands.setContent(next, { emitUpdate: false });
    lastAppliedExternalRef.current = nextExternal;
  }, [editor, valuePlain, props.valueDoc]);

  return (
    <div className="bg-black/[0.16]">
      {showToolbar ? (
        <div data-af-link-toolbar="true">
          <TipTapToolbar editor={editor} disabled={disabled} />
        </div>
      ) : null}
      <EditorContent editor={editor} />
    </div>
  );
}
