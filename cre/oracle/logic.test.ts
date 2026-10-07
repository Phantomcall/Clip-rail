import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decodeAbiParameters } from "viem";
import { claimCode, FLAG_OWNERSHIP_OK, FLAG_UNAVAILABLE } from "@cliprail/shared/claim";
import {
  type ActiveClip,
  buildUpdates,
  ClipStatus,
  chunk,
  deserializeUpdates,
  encodeReport,
  gasLimitFor,
  maxEntries,
  prioritize,
  RECEIVER_REVERTED,
  reportNotApplied,
  serializeUpdates,
  videosUrl,
  type YtItem,
} from "./logic.ts";

const CLIPPER = "0x1111111111111111111111111111111111111111" as const;

function clip(clipId: bigint, videoId: string, status: number, lastViews = 0n, lastLikes = 0n): ActiveClip {
  return { clipId, campaignId: 7n, clipper: CLIPPER, videoId, status, lastViews, lastLikes };
}

function fixture(): YtItem[] {
  const code = claimCode(7n, CLIPPER);
  const raw = readFileSync(new URL("./fixtures/videos.json", import.meta.url), "utf8").replaceAll("{{CODE}}", code);
  return (JSON.parse(raw) as { items: YtItem[] }).items;
}

test("pending clip with the claim code: ownership ok, counts rounded down, ISO date → unix", () => {
  const [u] = buildUpdates([clip(1n, "aaaaaaaaaaa", ClipStatus.Pending)], fixture());
  assert.equal(u.flags, FLAG_OWNERSHIP_OK);
  assert.equal(u.views, 12300n); // 12345 → step 50
  assert.equal(u.likes, 675n); // 678 → step 5
  assert.equal(u.publishedAt, BigInt(Date.UTC(2026, 9, 4, 12) / 1000));
});

test("pending clip without the code is still reported, with no ownership flag; hidden likes count as 0", () => {
  const [u] = buildUpdates([clip(2n, "bbbbbbbbbbb", ClipStatus.Pending)], fixture());
  assert.equal(u.flags, 0);
  assert.equal(u.views, 950n);
  assert.equal(u.likes, 0n);
});

test("active clip with no change since the last report is skipped", () => {
  assert.deepEqual(buildUpdates([clip(3n, "ccccccccccc", ClipStatus.Active, 5000n, 250n)], fixture()), []);
  assert.equal(buildUpdates([clip(3n, "ccccccccccc", ClipStatus.Active, 4000n, 200n)], fixture()).length, 1);
});

test("private or missing videos are UNAVAILABLE", () => {
  const out = buildUpdates([clip(4n, "ddddddddddd", ClipStatus.Active, 800n), clip(5n, "zzzzzzzzzzz", ClipStatus.Pending)], fixture());
  assert.deepEqual(
    out.map((u) => [u.clipId, u.flags]),
    [
      [4n, FLAG_UNAVAILABLE],
      [5n, FLAG_UNAVAILABLE],
    ],
  );
});

test("a code for another campaign or clipper does not count", () => {
  const other = { ...clip(6n, "aaaaaaaaaaa", ClipStatus.Pending), campaignId: 8n };
  assert.equal(buildUpdates([other], fixture())[0].flags, 0);
});

test("report encodes as (uint64, (uint256,uint64,uint64,uint64,uint8)[])", () => {
  const updates = buildUpdates([clip(1n, "aaaaaaaaaaa", ClipStatus.Pending)], fixture());
  const hex = encodeReport(42n, updates);
  const [round, decoded] = decodeAbiParameters(
    [
      { type: "uint64" },
      {
        type: "tuple[]",
        components: [
          { name: "clipId", type: "uint256" },
          { name: "views", type: "uint64" },
          { name: "likes", type: "uint64" },
          { name: "publishedAt", type: "uint64" },
          { name: "flags", type: "uint8" },
        ],
      },
    ],
    hex,
  );
  assert.equal(round, 42n);
  assert.deepEqual(decoded, updates);
});

test("serialize round-trips (the consensus boundary)", () => {
  const updates = buildUpdates([clip(1n, "aaaaaaaaaaa", ClipStatus.Pending), clip(2n, "bbbbbbbbbbb", ClipStatus.Pending)], fixture());
  assert.deepEqual(deserializeUpdates(serializeUpdates(updates)), updates);
});

test("gas: 200k + 265k × n, capped; 35 entries fit under 9.5M", () => {
  const gas = { gasBase: 200_000n, gasPerEntry: 265_000n, gasCap: 9_500_000n };
  assert.equal(gasLimitFor(3, gas), 995_000n);
  assert.equal(gasLimitFor(1000, gas), 9_500_000n);
  assert.equal(maxEntries(gas), 35);
});

test("prioritize keeps status changes, then the biggest gains, in clipId order", () => {
  const clips = [clip(1n, "a", ClipStatus.Active, 100n), clip(2n, "b", ClipStatus.Pending), clip(3n, "c", ClipStatus.Active, 0n), clip(4n, "d", ClipStatus.Active)];
  const updates = [
    { clipId: 1n, views: 150n, likes: 0n, publishedAt: 1n, flags: 1 },
    { clipId: 2n, views: 0n, likes: 0n, publishedAt: 1n, flags: 0 },
    { clipId: 3n, views: 9000n, likes: 0n, publishedAt: 1n, flags: 1 },
    { clipId: 4n, views: 0n, likes: 0n, publishedAt: 0n, flags: FLAG_UNAVAILABLE },
  ];
  assert.deepEqual(
    prioritize(updates, clips, 3).map((u) => u.clipId),
    [2n, 3n, 4n],
  );
});

test("batching and URL", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  const url = videosUrl(["aaaaaaaaaaa", "bbbbbbbbbbb"], "KEY");
  assert.match(url, /id=aaaaaaaaaaa,bbbbbbbbbbb/);
  assert.match(url, /part=snippet,statistics,status/);
  assert.match(url, /key=KEY$/);
});

test("worst case fits CRE limits: consensus observation < 25 KB, report < 50 KB", () => {
  const gas = { gasBase: 200_000n, gasPerEntry: 265_000n, gasCap: 9_500_000n };
  const max = 2n ** 64n - 1n;
  const full = Array.from({ length: maxEntries(gas) }, (_, i) => ({
    clipId: 10n ** 12n + BigInt(i),
    views: max,
    likes: max,
    publishedAt: 4_102_444_800n,
    flags: FLAG_OWNERSHIP_OK,
  }));
  assert.ok(new TextEncoder().encode(serializeUpdates(full)).length < 25_000);
  assert.ok((encodeReport(max, full).length - 2) / 2 < 50_000);
});

test("ClipStatus matches ICampaignVault.ClipStatus declaration order", () => {
  const sol = readFileSync(new URL("../../contracts/src/interfaces/ICampaignVault.sol", import.meta.url), "utf8");
  const body = /enum ClipStatus \{([^}]*)\}/.exec(sol)?.[1];
  assert.ok(body, "enum ClipStatus not found in ICampaignVault.sol");
  const names = body.split(",").map((s) => s.replace(/\/\/.*$/gm, "").trim()).filter(Boolean);
  assert.deepEqual(Object.fromEntries(names.map((n, i) => [n, i])), ClipStatus);
});

test("reportNotApplied: green tx is not enough (mock forwarder swallows vault reverts)", () => {
  assert.equal(reportNotApplied(1n, 1n, 0), null);
  assert.equal(reportNotApplied(1n, 1n, undefined), null);
  assert.match(reportNotApplied(1n, 1n, RECEIVER_REVERTED) ?? "", /reverted inside the forwarder/);
  assert.match(reportNotApplied(1n, 0n, 0) ?? "", /lastRound is 0, expected 1/);
});

test("both configs use the measured v1 gas plan: 200k + 265k per entry, 35 entries per report", () => {
  for (const net of ["testnet", "mainnet"]) {
    const cfg = JSON.parse(readFileSync(new URL(`./config.${net}.json`, import.meta.url), "utf8"));
    const gas = { gasBase: BigInt(cfg.gasBase), gasPerEntry: BigInt(cfg.gasPerEntry), gasCap: BigInt(cfg.gasCap) };
    assert.equal(maxEntries(gas), 35, net);
    assert.equal(gasLimitFor(3, gas), 995_000n, net); // Isaac measured ~850k for 3 activations
    assert.ok(gasLimitFor(35, gas) <= 9_500_000n, net);
  }
});
