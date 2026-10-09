/**
 * Plain-English reasons for what the vault did with a clip (PRD E5). Rules-based on purpose: the explanation is
 * computed from the same numbers the contract used, so it can never disagree with what was paid.
 */
import { count, percent, usd } from "@/lib/format";
import type { Campaign, Clip } from "@/lib/types";

export type Explanation = { tone: "info" | "warn" | "bad" | "good"; text: string };

export function explainClip(clip: Clip, campaign?: Pick<Campaign, "minLikeBps" | "maxPerClip" | "status"> | null): Explanation | null {
  if (clip.status === "Pending") {
    return { tone: "info", text: "Waiting for the oracle to find your claim code in the Short's description. Keep the Short public." };
  }
  if (clip.status === "Flagged") {
    return { tone: "bad", text: "The brand flagged this clip. Earnings still in hold are paused until they decide; if they don't decide in time, it's accepted." };
  }
  if (clip.status === "Rejected") {
    return clip.accrued > 0 || clip.released > 0
      ? { tone: "bad", text: `Rejected by the brand. Anything already paid (${usd(clip.released)}) stays yours.` }
      : { tone: "bad", text: "Rejected: the claim code wasn't found in time, or another clip already proved this video." };
  }
  if (clip.status === "Ended") return { tone: "info", text: "This clip has stopped earning: its campaign ended or the video went private." };

  if (campaign && clip.lastViews > 0) {
    const ratioBps = (clip.likes * 10_000) / clip.lastViews;
    if (ratioBps < campaign.minLikeBps) {
      const needed = Math.ceil((campaign.minLikeBps * clip.lastViews) / 10_000) - clip.likes;
      return {
        tone: "warn",
        text: `New views aren't paying: ${percent(Math.round(ratioBps))} of viewers liked it, below the campaign's ${percent(campaign.minLikeBps)} floor. About ${count(Math.max(needed, 1))} more likes would unlock earnings again.`,
      };
    }
    if (clip.accrued >= campaign.maxPerClip) {
      return { tone: "good", text: `This clip hit the campaign's ${usd(campaign.maxPerClip)} per-clip cap, so the rest of the budget goes to other clippers.` };
    }
  }
  return null;
}

export const EXPLAIN_TONE: Record<Explanation["tone"], string> = {
  info: "text-info",
  warn: "text-holding",
  bad: "text-danger",
  good: "text-money",
};
