//web/sanity/schemaTypes/lyrics.ts
import { defineField, defineType } from "sanity";
import LyricsImportInput from "../components/LyricsImportInput";
import { apiVersion } from "../lib/env";

type LyricsIdentityDocument = {
  _id?: string;
  recordingId?: string;
  cues?: Array<{ _key?: string }>;
};

type PublishedLyricsIdentity = {
  recordingId?: string;
  cueKeys?: Array<string | null>;
};

function norm(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function publishedIdFromStudioDocumentId(documentId: string): string | null {
  if (!documentId) return null;

  if (documentId.startsWith("drafts.")) {
    return documentId.slice("drafts.".length);
  }

  if (documentId.startsWith("versions.")) {
    return null;
  }

  return documentId;
}

function cueKeySet(cues: LyricsIdentityDocument["cues"]): Set<string> {
  const keys = new Set<string>();

  for (const cue of cues ?? []) {
    const key = norm(cue?._key);
    if (key) keys.add(key);
  }

  return keys;
}

export default defineType({
  name: "lyrics",
  title: "Lyrics",
  type: "document",
  validation: (rule) =>
    rule.custom(async (value: unknown, context) => {
      const current = value as LyricsIdentityDocument | null;
      const contextDocument = context.document as
        | LyricsIdentityDocument
        | undefined;

      const documentId = norm(contextDocument?._id ?? current?._id);
      if (!documentId) return true;

      const publishedId = publishedIdFromStudioDocumentId(documentId);
      if (!publishedId) {
        return "Lyrics Content Release versions are blocked because Exegesis identity protection only supports direct draft/publish editing.";
      }

      try {
        const client = context
          .getClient({ apiVersion })
          .withConfig({ perspective: "published", useCdn: false });

        const published = await client.fetch<PublishedLyricsIdentity | null>(
          `*[_type == "lyrics" && _id == $publishedId][0]{
            recordingId,
            "cueKeys": cues[]._key
          }`,
          { publishedId },
        );

        if (!published) return true;

        const currentRecordingId = norm(current?.recordingId);
        const publishedRecordingId = norm(published.recordingId);

        if (
          publishedRecordingId &&
          currentRecordingId !== publishedRecordingId
        ) {
          return {
            message:
              "Recording ID is immutable after publication because Exegesis state is keyed to it.",
            path: ["recordingId"],
          };
        }

        const currentKeys = cueKeySet(current?.cues);
        const publishedKeys = (published.cueKeys ?? []).filter(
          (key): key is string =>
            typeof key === "string" && key.trim().length > 0,
        );

        const missingKeys = publishedKeys.filter(
          (key) => !currentKeys.has(key.trim()),
        );

        if (missingKeys.length > 0) {
          return {
            message:
              `This edit removes ${missingKeys.length} established lyric cue ` +
              "identity/identities. Publishing is blocked to protect Exegesis " +
              "groups, discussions, and line links. Restore the cues or use an " +
              "explicit migration workflow.",
            path: ["cues"],
          };
        }

        return true;
      } catch {
        return "Could not verify established lyric identities. Publishing is blocked until Sanity identity validation succeeds.";
      }
    }),
  fields: [
    defineField({
      name: "recordingId",
      title: "Recording ID",
      type: "string",
      validation: (r) => r.required(),
    }),

    defineField({
      name: "offsetMs",
      title: "Offset (ms)",
      type: "number",
      initialValue: 0,
      description: "Positive pushes lyrics later; negative pulls earlier.",
      validation: (r) => r.integer(),
    }),

    defineField({
      name: "importText",
      title: "Import (paste LRC or JSON)",
      type: "text",
      description:
        "Paste .lrc text or JSON { offsetMs?, cues:[{tMs,text,endMs?}] } then click Apply below.",
    }),

    defineField({
      name: "version",
      title: "Version",
      type: "string",
      initialValue: "v1",
    }),

    defineField({
      name: "geniusUrl",
      title: "Genius URL",
      type: "url",
      description:
        "Optional outbound reference (e.g. Genius page for this track).",
    }),

    defineField({
      name: "exegesisEnabled",
      title: "Enable Exegesis",
      type: "boolean",
      initialValue: true,
      description:
        "Turn this off for skits, interludes, instrumentals, or tracks that should not appear in the Exegesis system.",
    }),

    defineField({
      name: "cues",
      title: "Cues",
      type: "array",
      of: [
        {
          type: "object",
          name: "cue",
          fields: [
            defineField({
              name: "tMs",
              type: "number",
              validation: (r) => r.required().integer().min(0),
            }),
            defineField({
              name: "endMs",
              type: "number",
              validation: (r) => r.integer().min(0),
            }),
            defineField({
              name: "text",
              type: "string",
              validation: (r) => r.required(),
            }),
          ],
        },
      ],
      components: { input: LyricsImportInput }, // replaces default array editor UI
      validation: (r) =>
        r.custom((value: unknown) => {
          if (!Array.isArray(value) || value.length === 0) return true;

          const PARA_BREAK = "__PARA_BREAK__";

          let prev = -1;
          for (const item of value) {
            if (!item || typeof item !== "object")
              return "Each cue must be an object.";

            const tMs = (item as Record<string, unknown>).tMs;
            const text = (item as Record<string, unknown>).text;

            if (typeof tMs !== "number" || !Number.isFinite(tMs))
              return "Each cue needs a numeric tMs.";
            if (tMs < 0) return "Cue tMs must be >= 0.";

            if (typeof text !== "string") return "Each cue needs text.";

            const isBreak = text === PARA_BREAK;
            const hasVisibleText = text.trim().length > 0;

            if (!isBreak && !hasVisibleText)
              return "Each cue needs non-empty text (or a paragraph break).";

            if (tMs < prev) return "Cues must be sorted by tMs ascending.";
            prev = tMs;
          }
          return true;
        }),
    }),
  ],
});
