// web/sanity/structure.ts
import type { StructureResolver } from "sanity/structure";

export const structure: StructureResolver = (S) =>
  S.list()
    .title("Content")
    .items([
      S.listItem()
        .title("Site Configuration")
        .id("siteFlagsSingleton")
        .child(S.document().schemaType("siteFlags").documentId("siteFlags")),

      S.divider(),

      S.listItem()
        .title("Site Shell")
        .child(S.documentTypeList("shadowHomePage").title("Site Shell")),

      ...S.documentTypeListItems().filter((listItem) => {
        const id = listItem.getId();
        return id !== "siteFlags" && id !== "shadowHomePage";
      }),
    ]);