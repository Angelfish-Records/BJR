import {type SchemaTypeDefinition} from 'sanity'
import {landingPage} from './landingPage'
import {shadowHomePage} from './shadowHomePage'
import {siteFlags} from './siteFlags'
import {portalPage} from './portalPage'
import {moduleRichText} from './modules/moduleRichText'


export const schema: {types: SchemaTypeDefinition[]} = {
  types: [landingPage, shadowHomePage, siteFlags, portalPage, moduleRichText],
}
