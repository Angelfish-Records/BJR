import { defineField, defineType } from "sanity";

export const moduleDownloadGrid = defineType({
  name: "moduleDownloadGrid",
  title: "Module: Download Grid",
  type: "object",
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      initialValue: "Downloads",
    }),
    defineField({
      name: "offers",
      title: "Offers",
      type: "array",
      validation: (r) => r.min(1).required(),
      of: [
        {
          type: "object",
          name: "downloadOffer",
          title: "Download offer",
          fields: [
            defineField({
              name: "albumSlug",
              title: "Album slug",
              type: "string",
              description: "Must match AlbumOffer.albumSlug",
              validation: (r) => r.required(),
            }),
            defineField({
              name: "coverImage",
              title: "Cover image",
              type: "image",
              options: { hotspot: true },
            }),
            defineField({
              name: "productLabel",
              title: "Product label",
              type: "string",
              initialValue: "Digital Album",
            }),
            defineField({
              name: "highlights",
              title: "Highlights",
              type: "array",
              of: [{ type: "string" }],
            }),
            defineField({
              name: "techSpec",
              title: "Tech spec callout (optional)",
              type: "string",
              description: "Eg “Download available in 24-bit / 96kHz”.",
            }),
            defineField({
              name: "giftBlurb",
              title: "Gift modal blurb (optional)",
              type: "text",
              rows: 2,
            }),
            defineField({
              name: "assets",
              title: "Assets to show (optional)",
              type: "array",
              description:
                "If empty, the portal will show all assets defined in code for this album offer. If set, only these buttons will appear (in this order).",
              of: [
                {
                  type: "object",
                  name: "downloadAssetSelector",
                  fields: [
                    defineField({
                      name: "assetId",
                      title: "Asset ID",
                      type: "string",
                      validation: (r) => r.required(),
                    }),
                    defineField({
                      name: "label",
                      title: "Button label override (optional)",
                      type: "string",
                    }),
                  ],
                  preview: {
                    select: { assetId: "assetId", label: "label" },
                    prepare({
                      assetId,
                      label,
                    }: {
                      assetId?: string;
                      label?: string;
                    }) {
                      return {
                        title: label ? `${label}` : `${assetId ?? ""}`,
                        subtitle: assetId
                          ? `assetId: ${assetId}`
                          : "download asset",
                      };
                    },
                  },
                },
              ],
            }),
          ],
          preview: {
            select: { albumSlug: "albumSlug", productLabel: "productLabel" },
            prepare({
              albumSlug,
              productLabel,
            }: {
              albumSlug?: string;
              productLabel?: string;
            }) {
              return {
                title: albumSlug ?? "Offer",
                subtitle: productLabel ?? "Digital Album",
              };
            },
          },
        },
      ],
    }),
  ],
  preview: {
    select: { title: "title", offers: "offers" },
    prepare({ title, offers }: { title?: string; offers?: unknown[] }) {
      return {
        title: title ?? "Download Grid",
        subtitle: `${Array.isArray(offers) ? offers.length : 0} offer(s)`,
      };
    },
  },
});
