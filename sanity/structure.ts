import type {StructureResolver} from 'sanity/structure'

export const structure: StructureResolver = (S) =>
  S.list()
    .title('Content')
    .items([
      S.listItem()
        .title('Landing Page')
        .id('landingPageSingleton')
        .child(S.document().schemaType('landingPage').documentId('landingPage')),

      ...S.documentTypeListItems().filter(
        (listItem) => listItem.getId() !== 'landingPage'
      ),
    ])
