/** CreatorReputation → Clipper.tier (the vault's tier gate reads the same contract). */
import { indexer } from "envio";
import { clipper } from "../lib";

indexer.onEvent({ contract: "CreatorReputation", event: "ReputationUpdated" }, async ({ event, context }) => {
  const who = await clipper(context, event.params.clipper, event.block.timestamp);
  context.Clipper.set({ ...who, tier: Number(event.params.tier) });
});
