/**
 * Cliprail view oracle (playbook D-2.1 to D-2.5). Every tick:
 *   cron → read lastRound() and activeClips() from the vault → YouTube videos.list in batches of 50 (node mode)
 *   → identical-aggregation consensus on the rounded counts → abi.encode(round, ClipUpdate[])
 *   → writeReport to the vault through the KeystoneForwarder with an explicit gas limit.
 * All payout rules run on chain (PRD §5.2); this workflow only reports what YouTube says.
 */
import {
  bytesToHex,
  consensusIdenticalAggregation,
  CronCapability,
  EVMClient,
  encodeCallMsg,
  getNetwork,
  HTTPClient,
  type HTTPSendRequester,
  handler,
  json,
  LAST_FINALIZED_BLOCK_NUMBER,
  ok,
  prepareReportRequest,
  Runner,
  type Runtime,
  TxStatus,
} from "@chainlink/cre-sdk";
import { type Address, decodeFunctionResult, encodeFunctionData, type Hex, zeroAddress } from "viem";
import { z } from "zod";
import { vaultAbi } from "./abi";
import {
  type ActiveClip,
  buildUpdates,
  chunk,
  deserializeUpdates,
  encodeReport,
  gasLimitFor,
  maxEntries,
  prioritize,
  serializeUpdates,
  videosUrl,
  type YtItem,
} from "./logic";

const configSchema = z.object({
  /** 6-field cron (seconds first). Minimum interval is 30 s. */
  schedule: z.string(),
  vault: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  chainSelectorName: z.enum(["monad-testnet", "monad-mainnet"]),
  isTestnet: z.boolean(),
  /** Video IDs per videos.list call (YouTube's max is 50). */
  batch: z.number().int().min(1).max(50),
  /** Watch-list entries per activeClips() call. */
  pageSize: z.number().int().min(1).max(500),
  /** Clips read per run. maxClips / batch must stay ≤ 14 (CRE allows 15 HTTP calls per run). */
  maxClips: z.number().int().min(1).max(700),
  gasBase: z.string().regex(/^\d+$/),
  gasPerEntry: z.string().regex(/^\d+$/),
  /** Hard cap per write; CRE allows 10M. */
  gasCap: z.string().regex(/^\d+$/),
});

type Config = z.infer<typeof configSchema>;

/** eth_call against the vault at the last finalized block, so every node reads the same state. */
function callVault(runtime: Runtime<Config>, evm: EVMClient, data: Hex): Hex {
  const reply = evm
    .callContract(runtime, {
      call: encodeCallMsg({ from: zeroAddress, to: runtime.config.vault as Address, data }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result();
  return bytesToHex(reply.data);
}

function readLastRound(runtime: Runtime<Config>, evm: EVMClient): bigint {
  const data = callVault(runtime, evm, encodeFunctionData({ abi: vaultAbi, functionName: "lastRound" }));
  return decodeFunctionResult({ abi: vaultAbi, functionName: "lastRound", data });
}

/** CRE allows 15 EVM reads per run: lastRound + watchListLength + at most this many pages. */
const MAX_PAGES = 12;

/**
 * activeClips(offset, limit) walks `limit` watch-list entries and drops flagged clips and closed or empty
 * campaigns, so a page can be short. Page by watch-list position until offset >= watchListLength().
 */
function readActiveClips(runtime: Runtime<Config>, evm: EVMClient, pageSize: number, maxClips: number): ActiveClip[] {
  const lenData = callVault(runtime, evm, encodeFunctionData({ abi: vaultAbi, functionName: "watchListLength" }));
  const len = decodeFunctionResult({ abi: vaultAbi, functionName: "watchListLength", data: lenData });
  const out: ActiveClip[] = [];
  const step = BigInt(pageSize);
  for (let offset = 0n, page = 0; offset < len && out.length < maxClips && page < MAX_PAGES; offset += step, page++) {
    const data = callVault(
      runtime,
      evm,
      encodeFunctionData({ abi: vaultAbi, functionName: "activeClips", args: [offset, step] }),
    );
    for (const c of decodeFunctionResult({ abi: vaultAbi, functionName: "activeClips", data })) {
      out.push({
        clipId: c.clipId,
        campaignId: c.campaignId,
        clipper: c.clipper,
        videoId: c.videoId,
        status: c.status,
        lastViews: c.lastViews,
        lastLikes: c.lastLikes,
      });
    }
  }
  if (out.length > maxClips) runtime.log(`watch list has more than ${maxClips} reportable clips; reporting the first ${maxClips}`);
  return out.slice(0, maxClips);
}

/**
 * Runs on each node: fetch YouTube, build the update list, keep what fits in one report, and return it as
 * one canonical string. Trimming here keeps the observation under CRE's 25 KB consensus limit.
 */
function fetchUpdates(sender: HTTPSendRequester, clips: ActiveClip[], batch: number, limit: number, apiKey: string): string {
  const items: YtItem[] = [];
  for (const ids of chunk(
    clips.map((c) => c.videoId),
    batch,
  )) {
    const res = sender.sendRequest({ url: videosUrl(ids, apiKey), method: "GET" }).result();
    // A failed batch fails the run (retried next tick) rather than marking its clips unavailable.
    if (!ok(res)) throw new Error(`YouTube videos.list failed: HTTP ${res.statusCode}`);
    items.push(...(((json(res) as { items?: YtItem[] }).items ?? []) as YtItem[]));
  }
  return serializeUpdates(prioritize(buildUpdates(clips, items), clips, limit));
}

const onTick = (runtime: Runtime<Config>): string => {
  const cfg = runtime.config;
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: cfg.chainSelectorName, isTestnet: cfg.isTestnet });
  if (!network) throw new Error(`Unknown chain ${cfg.chainSelectorName}`);
  const evm = new EVMClient(network.chainSelector.selector);

  const lastRound = readLastRound(runtime, evm);
  const clips = readActiveClips(runtime, evm, cfg.pageSize, cfg.maxClips);
  runtime.log(`round ${lastRound} · ${clips.length} active clips`);
  if (clips.length === 0) return "no active clips";

  const gas = { gasBase: BigInt(cfg.gasBase), gasPerEntry: BigInt(cfg.gasPerEntry), gasCap: BigInt(cfg.gasCap) };
  const apiKey = runtime.getSecret({ id: "YT_API_KEY" }).result().value;
  const serialized = new HTTPClient()
    .sendRequest(runtime, fetchUpdates, consensusIdenticalAggregation<string>())(clips, cfg.batch, maxEntries(gas), apiKey)
    .result();
  const updates = deserializeUpdates(serialized);
  for (const u of updates) {
    runtime.log(`clip ${u.clipId}: views=${u.views} likes=${u.likes} publishedAt=${u.publishedAt} flags=${u.flags}`);
  }
  if (updates.length === 0) return "no changes";

  // round = lastRound + 1 is deterministic across nodes; the vault rejects anything not strictly newer.
  const round = lastRound + 1n;
  const payload: Hex = encodeReport(round, updates);
  const gasLimit = gasLimitFor(updates.length, gas);
  runtime.log(`report round=${round} entries=${updates.length} gasLimit=${gasLimit} payload=${payload}`);

  const report = runtime.report(prepareReportRequest(payload)).result();
  const reply = evm
    .writeReport(runtime, { receiver: cfg.vault, report, gasConfig: { gasLimit: gasLimit.toString() } })
    .result();

  const txHash = reply.txHash ? bytesToHex(reply.txHash) : "none";
  if (reply.txStatus !== TxStatus.SUCCESS) {
    throw new Error(`writeReport failed (${reply.txStatus}): ${reply.errorMessage ?? "no message"} tx=${txHash}`);
  }
  runtime.log(`report landed: tx=${txHash}`);
  return `round ${round}: ${updates.length} clips · tx ${txHash}`;
};

const initWorkflow = (config: Config) => [handler(new CronCapability().trigger({ schedule: config.schedule }), onTick)];

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}
