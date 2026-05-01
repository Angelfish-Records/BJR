// web/sanity.cli.ts
/**
 * This configuration file lets us run `$ sanity [command]` in this folder
 * Go to https://www.sanity.io/docs/cli to learn more.
 **/
import { defineCliConfig } from "sanity/cli";
import { dataset, projectId } from "./sanity/lib/env";

export default defineCliConfig({ api: { projectId, dataset } });
