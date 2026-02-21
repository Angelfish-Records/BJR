//web/sanity/schemaTypes/lyrics.ts
import { defineField, defineType } from "sanity";
import LyricsImportInput from "../components/LyricsImportInput";

export default defineType({
  name: "lyrics",
  title: "Lyrics",
  type: "document",
  fields: [
    defineField({
      name: "trackId",
      title: "Track ID (app)",
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
          let prev = -1;
          for (const item of value) {
            if (!item || typeof item !== "object")
              return "Each cue must be an object.";
            const tMs = (item as Record<string, unknown>).tMs;
            const text = (item as Record<string, unknown>).text;
            if (typeof tMs !== "number" || !Number.isFinite(tMs))
              return "Each cue needs a numeric tMs.";
            if (tMs < 0) return "Cue tMs must be >= 0.";
            if (typeof text !== "string" || text.trim().length === 0)
              return "Each cue needs non-empty text.";
            if (tMs < prev) return "Cues must be sorted by tMs ascending.";
            prev = tMs;
          }
          return true;
        }),
    }),
  ],
});
