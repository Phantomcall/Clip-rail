import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

test("sandbox: a mint-only retry only while the record says the mint is still due", async () => {
  const { sandboxMintDue, SANDBOX_PENDING, SANDBOX_DONE } = await import("./logic.ts");
  const mon = 10n ** 17n;
  assert.equal(sandboxMintDue(SANDBOX_PENDING, 0, mon, 0n), true); // MON arrived, mint failed
  // Funded, registered a clip and sent the USDC out through the gasless relays: same chain state, no new mint.
  assert.equal(sandboxMintDue(SANDBOX_DONE, 0, mon, 0n), false);
  assert.equal(sandboxMintDue("1", 0, mon, 0n), false); // records from before the done marker
  assert.equal(sandboxMintDue(null, 0, mon, 0n), false);
  assert.equal(sandboxMintDue(SANDBOX_PENDING, 1, mon, 0n), false); // sent a transaction
  assert.equal(sandboxMintDue(SANDBOX_PENDING, 0, 0n, 0n), false); // MON not here yet
  assert.equal(sandboxMintDue(SANDBOX_PENDING, 0, mon, 1n), false); // already has USDC
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

test("oracle dispatch: off without a token or with a malformed repo/workflow; otherwise one POST to that workflow", async () => {
  const { oracleDispatch } = await import("./logic.ts");
  const on = { ORACLE_DISPATCH_TOKEN: "tok", ORACLE_REPO: "Phantomcall/Clip-rail", ORACLE_WORKFLOW: "oracle-runner.yml" };
  assert.equal(oracleDispatch({ ...on, ORACLE_DISPATCH_TOKEN: undefined }), null);
  assert.equal(oracleDispatch({ ...on, ORACLE_DISPATCH_TOKEN: "  " }), null);
  assert.equal(oracleDispatch({ ...on, ORACLE_REPO: "Phantomcall/Clip-rail/../x" }), null);
  assert.equal(oracleDispatch({ ...on, ORACLE_WORKFLOW: "../../pulls" }), null);
  const req = oracleDispatch(on)!;
  assert.equal(req.url, "https://api.github.com/repos/Phantomcall/Clip-rail/actions/workflows/oracle-runner.yml/dispatches");
  assert.equal(req.init.method, "POST");
  assert.equal((req.init.headers as Record<string, string>).authorization, "Bearer tok");
  assert.ok((req.init.headers as Record<string, string>)["user-agent"]);
  assert.deepEqual(JSON.parse(req.init.body as string), { ref: "main" });
});

test("the oracle cron in index.ts is one of wrangler.toml's testnet crons, and the workflow it starts exists", () => {
  const toml = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  const index = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const cron = /event\.cron === "([^"]+)"/.exec(index)?.[1];
  assert.ok(cron, "index.ts routes a cron to the oracle trigger");
  const testnetCrons = /\[triggers\]\s*crons = \[([^\]]*)\]/.exec(toml)?.[1] ?? "";
  assert.ok(testnetCrons.includes(`"${cron}"`), `wrangler.toml [triggers] must list "${cron}"`);
  const workflow = /ORACLE_WORKFLOW = "([^"]+)"/.exec(toml)?.[1];
  assert.ok(workflow && existsSync(new URL(`../../.github/workflows/${workflow}`, import.meta.url)));
  // workflow_dispatch must stay enabled in the workflow, or every dispatch fails with 422.
  assert.match(readFileSync(new URL(`../../.github/workflows/${workflow}`, import.meta.url), "utf8"), /^\s*workflow_dispatch:/m);
});

// ─────────────────────────── Worker oracle ───────────────────────────

test("oracle mode: only exact 'worker' or 'github' turn anything on; skip seconds default to 240", async () => {
  const { oracleMode, oracleSkipSeconds } = await import("./logic.ts");
  assert.equal(oracleMode({}), "off");
  assert.equal(oracleMode({ ORACLE_MODE: "worker" }), "worker");
  assert.equal(oracleMode({ ORACLE_MODE: " github " }), "github");
  for (const m of ["Worker", "workers", "on", "true", "worker,github", ""]) assert.equal(oracleMode({ ORACLE_MODE: m }), "off", m);
  assert.equal(oracleSkipSeconds({}), 240);
  assert.equal(oracleSkipSeconds({ ORACLE_SKIP_SECONDS: "0" }), 0);
  assert.equal(oracleSkipSeconds({ ORACLE_SKIP_SECONDS: "600" }), 600);
  for (const s of ["-1", "4m", "1e3", "3601", "99999"]) assert.equal(oracleSkipSeconds({ ORACLE_SKIP_SECONDS: s }), 240, s);
});

test("oracle gas plan and paging match the CRE workflow's testnet config", async () => {
  const { ORACLE_GAS, ORACLE_MAX_CLIPS, ORACLE_PAGE } = await import("./logic.ts");
  const cfg = JSON.parse(readFileSync(new URL("../../cre/oracle/config.testnet.json", import.meta.url), "utf8"));
  assert.equal(ORACLE_GAS.gasBase, BigInt(cfg.gasBase));
  assert.equal(ORACLE_GAS.gasPerEntry, BigInt(cfg.gasPerEntry));
  assert.equal(ORACLE_GAS.gasCap, BigInt(cfg.gasCap));
  assert.equal(ORACLE_PAGE, cfg.pageSize);
  assert.equal(ORACLE_MAX_CLIPS, cfg.maxClips);
});

test("oracle run plan: skips while another runner is reporting, debounces register runs, runs otherwise", async () => {
  const { planOracleRun, ORACLE_REGISTER_DEBOUNCE } = await import("./logic.ts");
  const st = (o: object) => ({ round: "10", own: true, seenAt: 0, checkedAt: 0, ranAt: 0, ...o });
  // No state yet: run.
  assert.equal(planOracleRun(null, 10n, 1_000, 240, "cron").run, true);
  // Our own round, unchanged: run.
  assert.deepEqual(planOracleRun(st({}), 10n, 1_000, 240, "cron"), { run: true, why: "", store: null });
  // Someone else moved it since we looked: skip and remember when.
  const moved = planOracleRun(st({}), 12n, 1_000, 240, "cron");
  assert.equal(moved.run, false);
  assert.deepEqual(moved.store, st({ round: "12", own: false, seenAt: 1_000 }));
  // Still inside the window: skip without a write; after it: run.
  assert.deepEqual(planOracleRun(st({ round: "12", own: false, seenAt: 1_000 }), 12n, 1_239, 240, "cron").run, false);
  assert.equal(planOracleRun(st({ round: "12", own: false, seenAt: 1_000 }), 12n, 1_239, 240, "cron").store, null);
  assert.equal(planOracleRun(st({ round: "12", own: false, seenAt: 1_000 }), 12n, 1_240, 240, "cron").run, true);
  // Skip window 0: never skip, but still record the other runner's round.
  const zero = planOracleRun(st({}), 12n, 1_000, 0, "cron");
  assert.equal(zero.run, true);
  assert.equal(zero.store?.round, "12");
  // Register runs are debounced; cron runs are not.
  const recent = st({ ranAt: 1_000 });
  assert.equal(planOracleRun(recent, 10n, 1_000 + ORACLE_REGISTER_DEBOUNCE - 1, 240, "register").run, false);
  assert.equal(planOracleRun(recent, 10n, 1_000 + ORACLE_REGISTER_DEBOUNCE, 240, "register").run, true);
  assert.equal(planOracleRun(recent, 10n, 1_001, 240, "cron").run, true);
  // A stale KV read (lastRound behind what we stored) is not "another runner".
  assert.equal(planOracleRun(st({}), 9n, 1_000, 240, "cron").run, true);
});

test("oracle state: malformed KV values read as no state; missing numbers as 0", async () => {
  const { parseOracleState } = await import("./logic.ts");
  for (const bad of [null, {}, "x", { round: 5 }, { round: "-1" }, { round: "1e3" }]) assert.equal(parseOracleState(bad), null);
  assert.deepEqual(parseOracleState({ round: "7", own: "yes", seenAt: "3", checkedAt: 9 }), { round: "7", own: false, seenAt: 0, checkedAt: 9, ranAt: 0 });
});

test("forwarder raw report: 109-byte header laid out like the fork test, then the vault report", async () => {
  const { forwarderRawReport } = await import("./logic.ts");
  const { encodeReport } = await import("@cliprail/cre-oracle/logic.ts");
  const exec = `0x${"ab".repeat(32)}` as const;
  const body = encodeReport(5n, [{ clipId: 1n, views: 100n, likes: 10n, publishedAt: 1_700_000_000n, flags: 1 }]);
  const raw = forwarderRawReport(exec, 0x01020304, body);
  const bytes = (raw.length - 2) / 2;
  assert.equal(bytes, 109 + (body.length - 2) / 2);
  const at = (off: number, len: number) => raw.slice(2 + off * 2, 2 + (off + len) * 2);
  assert.equal(at(0, 1), "01");
  assert.equal(at(1, 32), "ab".repeat(32));
  assert.equal(at(33, 4), "01020304");
  assert.equal(at(37, 8), "0".repeat(16)); // donId, configVersion
  assert.equal(at(45, 32), "0".repeat(64)); // workflowCid
  assert.equal(Buffer.from(at(77, 10), "hex").toString("latin1").replace(/\0+$/, ""), "cr-worker");
  assert.equal(at(87, 20), "0".repeat(40)); // workflowOwner
  assert.equal(at(107, 2), "0001");
  assert.equal(`0x${raw.slice(2 + 109 * 2)}`, body);
  assert.throws(() => forwarderRawReport("0x1234", 0, body));
});

test("report outcome: applied only if the vault accepted; a refused report whose round already landed is a lost race", async () => {
  const { reportOutcome } = await import("./logic.ts");
  assert.equal(reportOutcome(5n, 5n, true), "applied");
  assert.equal(reportOutcome(5n, 6n, true), "applied"); // ours landed, then another round already followed
  assert.equal(reportOutcome(5n, 5n, false), "lost-race");
  assert.equal(reportOutcome(5n, 4n, false), "failed"); // e.g. out of gas inside the forwarder
  assert.equal(reportOutcome(5n, 4n, true), "failed"); // event said yes but lastRound didn't move: don't trust it
});

test("keeper guard: a Pending clip expires only after a clean oracle check that came after its registration", async () => {
  const { oracleCheckedSince } = await import("./logic.ts");
  assert.equal(oracleCheckedSince(0, 100n), false); // never checked
  assert.equal(oracleCheckedSince(100, 100n), false); // same second: not proven to include it
  assert.equal(oracleCheckedSince(101, 100n), true);
});
