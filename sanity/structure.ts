import type { StructureResolver } from "sanity/structure";

export const structure: StructureResolver = (S) =>
  S.list()
    .title("Content")
    .items([
      S.listItem()
        .title("Landing Page")
        .id("landingPageSingleton")
        .child(
          S.document().schemaType("landingPage").documentId("landingPage"),
        ),

      S.listItem()
        .title("Site Flags")
        .id("siteFlagsSingleton")
        .child(S.document().schemaType("siteFlags").documentId("siteFlags")),

      S.divider(),

      S.listItem()
        .title("Shadow Home Pages")
        .child(S.documentTypeList("shadowHomePage").title("Shadow Home Pages")),

      ...S.documentTypeListItems().filter((listItem) => {
        const id = listItem.getId();
        return (
          id !== "landingPage" && id !== "siteFlags" && id !== "shadowHomePage"
        );
      }),
    ]);
