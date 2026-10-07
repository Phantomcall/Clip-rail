/** CreatorReputation → Clipper.tier and rejections (the vault's tier gate reads the same contract; rejections count
 * distinct rejecting brands, audit V1-3). */
import { indexer } from "envio";
import { clipper } from "../lib";

indexer.onEvent({ contract: "CreatorReputation", event: "ReputationUpdated" }, async ({ event, context }) => {
  const who = await clipper(context, event.params.clipper, event.block.timestamp);
  context.Clipper.set({ ...who, tier: Number(event.params.tier), rejections: Number(event.params.rejections) });
});
