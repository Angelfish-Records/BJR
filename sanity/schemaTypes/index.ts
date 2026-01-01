import {type SchemaTypeDefinition} from 'sanity'
import {landingPage} from './landingPage'
import {shadowHomePage} from './shadowHomePage'
import {siteFlags} from './siteFlags'

export const schema: {types: SchemaTypeDefinition[]} = {
  types: [landingPage, shadowHomePage, siteFlags],
}
