import {type SchemaTypeDefinition} from 'sanity'
import {landingPage} from './landingPage'
import {shadowHomePage} from './shadowHomePage'
import {siteFlags} from './siteFlags'
import {portalPage} from './portalPage'
import {moduleHeading} from './moduleHeading'
import {moduleCardGrid} from './moduleCardGrid'
import {moduleDownloads} from './moduleDownloads'
import {moduleDownloadGrid} from './moduleDownloadGrid'
import {moduleRichText} from './modules/moduleRichText'
import {artistPost} from './artistPost'
import {moduleArtistPosts} from './moduleArtistPosts'
import album from './album'
import lyrics from './lyrics'


export const schema: {types: SchemaTypeDefinition[]} = {
  types: [landingPage, shadowHomePage, siteFlags, portalPage, moduleHeading, moduleCardGrid, moduleDownloads, moduleDownloadGrid, moduleRichText, artistPost, moduleArtistPosts, album, lyrics],
}
