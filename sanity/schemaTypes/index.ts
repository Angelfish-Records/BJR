//web/sanity/schemaTypes/index.ts
import { type SchemaTypeDefinition } from "sanity";
import { landingPage } from "./landingPage";
import { shadowHomePage } from "./shadowHomePage";
import { siteFlags } from "./siteFlags";
import { portalPage } from "./portalPage";
import { moduleHeading } from "./moduleHeading";
import { modulePanels } from "./modulePanels";
import { moduleDownloads } from "./moduleDownloads";
import { moduleDownloadGrid } from "./moduleDownloadGrid";
import { artistPost } from "./artistPost";
import { moduleArtistPosts } from "./moduleArtistPosts";
import { moduleExegesis } from "./moduleExegesis";
import { moduleMemberPanel } from "./moduleMemberPanel";
import album from "./album";
import lyrics from "./lyrics";

export const schema: { types: SchemaTypeDefinition[] } = {
  types: [
    landingPage,
    shadowHomePage,
    siteFlags,
    portalPage,
    moduleHeading,
    modulePanels,
    moduleDownloads,
    moduleDownloadGrid,
    artistPost,
    moduleArtistPosts,
    moduleExegesis,
    moduleMemberPanel,
    album,
    lyrics,
  ],
};
