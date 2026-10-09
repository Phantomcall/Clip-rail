import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { claimCode } from "@cliprail/shared/claim";
import {
  backoffSecs,
  chunk,
  dailyKey,
  deadlineOk,
  firstIssue,
  isoDurationSecs,
  maturedTranches,
  MAX_TRANCHES_PER_RELEASE,
  nextBackoff,
  planReleases,
  RELEASE_TX_GAS_MAX,
  releaseGasFor,
  originAllowed,
  payoutBody,
  registerBody,
  RELAY_GAS_CAP,
  relayGas,
  releaseGas,
  revertMessage,
  toPreview,
  transferBody,
  type YtVideo,
} from "./logic.ts";

const clipper = "0xc7e501c18846080439131e31ad5d4b56f7bca0f0";
const sig65 = `0x${"ab".repeat(65)}`;

test("register body: valid strings become bigints and a checksummed address", () => {
  const b = registerBody.parse({ campaignId: "1", videoId: "BQuUJ_-7VrU", clipper, nonce: "0", deadline: "1791400000", sig: sig65 });
  assert.equal(b.campaignId, 1n);
  assert.equal(b.clipper, "0xC7e501C18846080439131E31Ad5D4b56f7bcA0F0");
  assert.equal(b.deadline, 1_791_400_000n);
});

test("register body: rejects bad ids, numbers, addresses and signatures", () => {
  const ok = { campaignId: "1", videoId: "BQuUJ_-7VrU", clipper, nonce: "0", deadline: "1", sig: sig65 };
  for (const [field, value] of [
    ["videoId", "short"],
    ["videoId", "BQuUJ_-7VrU&x"],
    ["campaignId", "-1"],
    ["campaignId", "1e3"],
    ["campaignId", 1],
    ["clipper", "0x123"],
    ["sig", "0x1234"],
    ["sig", `0x${"zz".repeat(65)}`],
    ["sig", `0x${"ab".repeat(3000)}`],
  ] as const) {
    const r = registerBody.safeParse({ ...ok, [field]: value });
    assert.equal(r.success, false, `${field}=${String(value).slice(0, 20)} should fail`);
    if (!r.success) assert.match(firstIssue(r.error), new RegExp(`^${field}`));
  }
});

test("payout and transfer bodies parse", () => {
  assert.equal(
    payoutBody.parse({ clipper, payout: "0x0000000000000000000000000000000000000000", nonce: "3", deadline: "9", sig: sig65 }).nonce,
    3n,
  );
  const t = transferBody.parse({
    from: clipper,
    to: "0x33d89Bf77e5f7ff5756349e928AB054ff3dA7d2C",
    value: "50000",
    validAfter: "0",
    validBefore: "9",
    nonce: `0x${"11".repeat(32)}`,
    sig: sig65,
  });
  assert.equal(t.value, 50_000n);
  assert.equal(transferBody.safeParse({ ...t, value: "1", validAfter: "0", validBefore: "9", nonce: "0x11" }).success, false);
});

test("deadline must be ahead of now by the margin", () => {
  assert.equal(deadlineOk(1_000n, 900), true);
  assert.equal(deadlineOk(1_000n, 970), false);
  assert.equal(deadlineOk(1_000n, 1_000), false);
  assert.equal(deadlineOk(1_000n, 900.451), true); // Date.now() / 1000 has a fraction
});

test("gas: relays are estimate × 1.15 and the measured register (276k) fits its cap", () => {
  assert.equal(relayGas(100_000n), 115_000n);
  assert.ok(relayGas(276_337n) <= RELAY_GAS_CAP.register);
  assert.equal(releaseGas(1), 368_500n);
  assert.equal(releaseGas(25), 6_308_500n); // docs/gas.md: batches of 25 cost at most ~6.3M
  assert.ok(releaseGas(25) < 9_500_000n);
});

test("ISO 8601 durations", () => {
  assert.equal(isoDurationSecs("PT42S"), 42);
  assert.equal(isoDurationSecs("PT1M5S"), 65);
  assert.equal(isoDurationSecs("PT1H"), 3600);
  assert.equal(isoDurationSecs("P1DT1S"), 86_401);
  assert.equal(isoDurationSecs("P0D"), 0);
  assert.equal(isoDurationSecs(undefined), 0);
  assert.equal(isoDurationSecs("garbage"), 0);
});

test("preview: maps videos.list and finds the claim code in the description", () => {
  const code = claimCode(1n, clipper);
  const v: YtVideo = {
    id: "BQuUJ_-7VrU",
    snippet: {
      title: "Test Short",
      channelTitle: "Cliprail",
      description: `great clip\n${code.toLowerCase()}`,
      publishedAt: "2026-10-07T08:00:00Z",
      thumbnails: { high: { url: "https://i.ytimg.com/vi/BQuUJ_-7VrU/hqdefault.jpg" } },
    },
    statistics: { viewCount: "50", likeCount: "5" },
    contentDetails: { duration: "PT31S" },
    status: { privacyStatus: "public", uploadStatus: "processed" },
  };
  const p = toPreview(v, code);
  assert.deepEqual(p, {
    videoId: "BQuUJ_-7VrU",
    title: "Test Short",
    channel: "Cliprail",
    thumb: "https://i.ytimg.com/vi/BQuUJ_-7VrU/hqdefault.jpg",
    views: 50,
    likes: 5,
    publishedAt: Date.parse("2026-10-07T08:00:00Z") / 1000,
    durationSec: 31,
    public: true,
    codeFound: true,
  });
  assert.equal(toPreview(v, claimCode(2n, clipper)).codeFound, false);
  assert.equal(toPreview(v, null).codeFound, false);
  // Hidden likes count as 0; unlisted or still processing is not public.
  const hidden = toPreview({ ...v, statistics: { viewCount: "9" }, status: { privacyStatus: "unlisted", uploadStatus: "processed" } }, code);
  assert.equal(hidden.likes, 0);
  assert.equal(hidden.public, false);
  assert.equal(toPreview({ ...v, status: { privacyStatus: "public", uploadStatus: "uploaded" } }, code).public, false);
});

test("preview shape matches what web/lib/youtube.ts expects", () => {
  const src = readFileSync(new URL("../../web/lib/youtube.ts", import.meta.url), "utf8");
  const body = /export interface Preview \{([^}]*)\}/.exec(src)?.[1] ?? "";
  const webFields = [...body.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]).sort();
  const ours = Object.keys(toPreview({ id: "BQuUJ_-7VrU" }, null)).sort();
  assert.deepEqual(ours, webFields);
});

test("keeper back-off: 1 h, 2 h, 4 h … capped at 24 h", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 10].map(backoffSecs), [3600, 7200, 14_400, 28_800, 57_600, 86_400, 86_400]);
  const first = nextBackoff(null, 1_000);
  assert.deepEqual(first, { failures: 1, until: 4_600 });
  assert.deepEqual(nextBackoff(first, 5_000), { failures: 2, until: 12_200 });
});

test("chunk", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 25), []);
});

test("daily rate-limit key is per network, route, address and UTC day", () => {
  const k = dailyKey("testnet", "register", "0xC7e501C18846080439131E31Ad5D4b56f7bcA0F0", Date.parse("2026-10-08T23:59:59Z"));
  assert.equal(k, "rl:testnet:register:0xc7e501c18846080439131e31ad5d4b56f7bca0f0:2026-10-08");
  assert.notEqual(k, dailyKey("testnet", "register", clipper, Date.parse("2026-10-09T00:00:00Z")));
});

test("CORS: exact origins and one-label wildcards only", () => {
  const list = "https://cliprail.vercel.app, https://cliprail-*-chibey-maxs-projects.vercel.app,http://localhost:3000";
  assert.equal(originAllowed("https://cliprail.vercel.app", list), true);
  assert.equal(originAllowed("http://localhost:3000", list), true);
  assert.equal(originAllowed("https://cliprail-git-main-chibey-maxs-projects.vercel.app", list), true);
  assert.equal(originAllowed("https://evil.com", list), false);
  assert.equal(originAllowed("https://cliprail.vercel.app.evil.com", list), false);
  assert.equal(originAllowed("https://cliprailxvercel.app", list), false); // dots are literal
  assert.equal(originAllowed("https://cliprail-a.b-chibey-maxs-projects.vercel.app", list), false); // * doesn't cross dots
  assert.equal(originAllowed(null, list), false);
});

test("revert messages: known vault errors read well, others say what failed", () => {
  assert.equal(revertMessage("VideoAlreadyRegistered", undefined), "This Short is already registered.");
  assert.equal(revertMessage(undefined, "FiatTokenV2: invalid signature"), "The transaction would fail: FiatTokenV2: invalid signature");
  assert.equal(revertMessage("SomethingNew", undefined), "The transaction would fail (SomethingNew).");
});

test("every vault error the relayer maps exists in the ABI", () => {
  const raw = JSON.parse(readFileSync(new URL("../../packages/abi/CampaignVault.json", import.meta.url), "utf8"));
  const abi: { type: string; name?: string }[] = Array.isArray(raw) ? raw : raw.abi;
  const names = new Set(abi.filter((x) => x.type === "error").map((x) => x.name));
  for (const n of ["TierTooLow", "CampaignNotActive", "CampaignEnded", "VideoAlreadyRegistered", "InvalidVideoId",
    "ExpiredDeadline", "InvalidNonce", "InvalidSignature", "TooManyPending", "InvalidPayout", "EnforcedPause"]) {
    assert.ok(names.has(n), `${n} not in the vault ABI`);
  }
});

test("release gas grows with matured tranches and covers the fork measurements", () => {
  // Fork, 2026-10-08: release([1]) with 60 matured tranches used 336,548; release([2]) with 5 used 251,389.
  assert.ok(releaseGasFor([60]) >= 336_548n);
  assert.ok(releaseGasFor([5]) >= 251_389n);
  // About 1.5k gas per tranche measured, so 200 tranches need ~550k: the old flat 368.5k limit ran out of gas.
  assert.ok(releaseGasFor([200]) >= 251_389n + 195n * 1_600n);
  assert.equal(releaseGasFor([500]), releaseGasFor([MAX_TRANCHES_PER_RELEASE])); // _pay stops at 200
  assert.equal(releaseGasFor([0]), releaseGasFor([1]));
});

test("matured tranches: skips the paid prefix, stops at the first locked one, caps at 200", () => {
  const t = (amount: bigint, unlockAt: bigint) => ({ amount, unlockAt });
  const ts = [t(10n, 100n), t(20n, 200n), t(30n, 300n), t(40n, 400n)];
  assert.equal(maturedTranches(ts, 0n, 250n), 2);
  assert.equal(maturedTranches(ts, 10n, 250n), 1); // first one paid
  assert.equal(maturedTranches(ts, 30n, 1_000n), 2); // two paid, two left, both matured
  assert.equal(maturedTranches(ts, 100n, 1_000n), 0); // all paid
  assert.equal(maturedTranches(ts, 0n, 50n), 0); // nothing matured yet
  const many = Array.from({ length: 300 }, (_, i) => t(1n, BigInt(i)));
  assert.equal(maturedTranches(many, 0n, 10_000n), 200);
});

test("release batches: at most 25 clips and 8M gas each, nothing dropped, order kept", () => {
  const ids = (n: number, tranches: number) => Array.from({ length: n }, (_, i) => ({ id: BigInt(i + 1), tranches }));
  const light = planReleases(ids(60, 1));
  assert.deepEqual(light.map((b) => b.ids.length), [25, 25, 10]);
  const heavy = planReleases(ids(30, 200));
  for (const b of heavy) assert.ok(b.gas <= RELEASE_TX_GAS_MAX, `batch of ${b.ids.length} needs ${b.gas}`);
  assert.deepEqual(heavy.flatMap((b) => b.ids), ids(30, 200).map((x) => x.id));
  // Every batch's limit is the formula for exactly its own clips.
  assert.equal(planReleases([{ id: 7n, tranches: 60 }])[0].gas, releaseGasFor([60]));
  assert.deepEqual(planReleases([]), []);
});

test("@noble/curves is pinned to viem's version, so the window-4 setting in chain.ts reaches viem's signer", () => {
  const ours = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).dependencies["@noble/curves"];
  const viemPkg = JSON.parse(readFileSync(new URL("../node_modules/viem/package.json", import.meta.url), "utf8"));
  assert.equal(ours, viemPkg.dependencies["@noble/curves"]);
});

test("sandbox body: one valid address", async () => {
  const { sandboxBody } = await import("./logic.ts");
  assert.equal(sandboxBody.parse({ address: clipper }).address, "0xC7e501C18846080439131E31Ad5D4b56f7bcA0F0");
  assert.equal(sandboxBody.safeParse({ address: "0x12" }).success, false);
  assert.equal(sandboxBody.safeParse({}).success, false);
});

test("Monad reserve balance: when a MON transfer needs an 'emptying' slot", async () => {
  const { needsEmptyingSlot, noInflight, MONAD_USER_RESERVE } = await import("./logic.ts");
  const e = 10n ** 18n;
  const tenth = e / 10n, gas = e / 20n;
  assert.equal(MONAD_USER_RESERVE, 10n * e);
  assert.equal(needsEmptyingSlot(4n * e, tenth, gas), true); // the relayer today (~4.8 MON)
  assert.equal(needsEmptyingSlot(10n * e, tenth, gas), true); // 10 MON is not enough: it would end below 10
  assert.equal(needsEmptyingSlot(10n * e + tenth + gas, tenth, gas), false);
  assert.equal(noInflight(13, 13, 13), true);
  assert.equal(noInflight(13, 12, 13), false); // a relayer tx was mined in the last 3 blocks
  assert.equal(noInflight(13, 13, 14), false); // one is pending
});
