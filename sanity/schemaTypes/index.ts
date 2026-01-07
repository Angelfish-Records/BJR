import {type SchemaTypeDefinition} from 'sanity'
import {landingPage} from './landingPage'
import {shadowHomePage} from './shadowHomePage'
import {siteFlags} from './siteFlags'
import {portalPage} from './portalPage'
import {moduleHeading} from './moduleHeading'
import {moduleCardGrid} from './moduleCardGrid'
import {moduleDownloads} from './moduleDownloads'
import {moduleRichText} from './modules/moduleRichText'
import album from './album'


export const schema: {types: SchemaTypeDefinition[]} = {
  types: [landingPage, shadowHomePage, siteFlags, portalPage, moduleHeading, moduleCardGrid, moduleDownloads, moduleRichText, album],
}
