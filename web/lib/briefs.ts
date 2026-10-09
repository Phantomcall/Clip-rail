/**
 * Campaign brief text (brand name, title, brief, source video) lives off-chain; only its hash is on-chain.
 * The ops Worker stores it (POST /briefs) only if keccak256(brief) equals the campaign's briefHash, so nobody can
 * swap in another text, and serves it from GET /briefs/:campaignId. Without it, this returns a neutral fallback.
 */
import { parseEventLogs, type Hex } from "viem";
import { vaultAbi } from "@/lib/abi";
import { publicClient } from "@/lib/chains";

export interface Brief {
  brandName: string;
  title: string;
  brief: string;
  sourceVideoId: string;
}

export async function getBrief(campaignId: string): Promise<Brief> {
  const ops = process.env.NEXT_PUBLIC_OPS_URL;
  if (ops) {
    try {
      const res = await fetch(`${ops}/briefs/${campaignId}`, { next: { revalidate: 60 } });
      if (res.ok) return (await res.json()) as Brief;
    } catch {
      // fall through to the fallback
    }
  }
  // no stored brief yet: pages fall back to the brand address and hide the brief and source video
  return { brandName: "", title: `Campaign #${campaignId}`, brief: "", sourceVideoId: "" };
}

/** After funding: send the exact brief JSON that was hashed. Best effort; the campaign is live either way. */
export async function saveBrief(createTx: Hex, brief: string): Promise<boolean> {
  const ops = process.env.NEXT_PUBLIC_OPS_URL;
  if (!ops) return false;
  try {
    const receipt = await publicClient().getTransactionReceipt({ hash: createTx });
    const [created] = parseEventLogs({ abi: vaultAbi, eventName: "CampaignCreated", logs: receipt.logs });
    if (!created) return false;
    const res = await fetch(`${ops}/briefs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ campaignId: created.args.id.toString(), brief }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
